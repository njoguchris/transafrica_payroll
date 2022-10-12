# Copyright (c) 2022, Christopher Njogu and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.meta import get_field_precision
from frappe.utils import flt

import erpnext
from erpnext.stock.doctype.serial_no.serial_no import get_serial_nos


class BudgetCostingVoucher(Document):
    @frappe.whitelist()
    def get_items_from_purchase_receipts(self):
        self.set("items", [])
        for pr in self.get("purchase_receipts"):
            if pr.receipt_document_type and pr.receipt_document:
                pr_items = frappe.db.sql(
                    """select pr_item.item_code, pr_item.description,
                    pr_item.qty, pr_item.base_rate, pr_item.base_amount, pr_item.name,
                    pr_item.cost_center, pr_item.is_fixed_asset
                    from `tab{doctype} Item` pr_item where parent = %s
                    and exists(select name from tabItem
                        where name = pr_item.item_code and (is_stock_item = 1 or is_fixed_asset=1))
                    """.format(
                        doctype=pr.receipt_document_type
                    ),
                    pr.receipt_document,
                    as_dict=True,
                )

                for d in pr_items:
                    item = self.append("items")
                    item.item_code = d.item_code
                    item.description = d.description
                    item.qty = d.qty
                    item.rate = d.base_rate
                    item.cost_center = d.cost_center or erpnext.get_default_cost_center(self.company)
                    item.amount = d.base_amount
                    item.receipt_document_type = pr.receipt_document_type
                    item.receipt_document = pr.receipt_document
                    item.purchase_receipt_item = d.name
                    item.is_fixed_asset = d.is_fixed_asset

    def validate(self):
        self.check_mandatory()
        self.validate_receipt_documents()
        init_landed_taxes_and_totals(self)
        self.set_total_taxes_and_charges()
        if not self.get("items"):
            self.get_items_from_purchase_receipts()

        self.set_applicable_charges_on_item()
        self.validate_applicable_charges_for_item()

    def check_mandatory(self):
        if not self.get("purchase_receipts"):
            frappe.throw(_("Please enter Order Document"))

    def validate_receipt_documents(self):
        receipt_documents = []

        for d in self.get("purchase_receipts"):
            docstatus = frappe.db.get_value(d.receipt_document_type, d.receipt_document, "docstatus")
            if docstatus != 1:
                msg = (
                    f"Row {d.idx}: {d.receipt_document_type} {frappe.bold(d.receipt_document)} must be submitted"
                )
                frappe.throw(_(msg), title=_("Invalid Document"))
            receipt_documents.append(d.receipt_document)

        for item in self.get("items"):
            if not item.receipt_document:
                frappe.throw(_("Item must be added using 'Get Items from Purchase Orders' button"))

            elif item.receipt_document not in receipt_documents:
                frappe.throw(
                    _("Item Row {0}: {1} {2} does not exist in above '{1}' table").format(
                        item.idx, item.receipt_document_type, item.receipt_document
                    )
                )

            if not item.cost_center:
                frappe.throw(
                    _("Row {0}: Cost center is required for an item {1}").format(item.idx, item.item_code)
                )

    def set_total_taxes_and_charges(self):
        self.total_taxes_and_charges = sum(flt(d.base_amount) for d in self.get("taxes"))

    def set_applicable_charges_on_item(self):
        if self.get("taxes") and self.distribute_charges_based_on != "Distribute Manually":
            total_item_cost = 0.0
            total_charges = 0.0
            item_count = 0
            based_on_field = frappe.scrub(self.distribute_charges_based_on)

            for item in self.get("items"):
                total_item_cost += item.get(based_on_field)

            for item in self.get("items"):
                item.applicable_charges = flt(
                    flt(item.get(based_on_field)) * (flt(self.total_taxes_and_charges) / flt(total_item_cost)),
                    item.precision("applicable_charges"),
                )
                total_charges += item.applicable_charges
                item_count += 1

            if total_charges != self.total_taxes_and_charges:
                diff = self.total_taxes_and_charges - total_charges
                self.get("items")[item_count - 1].applicable_charges += diff

    def validate_applicable_charges_for_item(self):
        based_on = self.distribute_charges_based_on.lower()

        if based_on != "distribute manually":
            total = sum(flt(d.get(based_on)) for d in self.get("items"))
        else:
            # consider for proportion while distributing manually
            total = sum(flt(d.get("applicable_charges")) for d in self.get("items"))

        if not total:
            frappe.throw(
                _(
                    "Total {0} for all items is zero, may be you should change 'Distribute Charges Based On'"
                ).format(based_on)
            )

        total_applicable_charges = sum(flt(d.applicable_charges) for d in self.get("items"))

        precision = get_field_precision(
            frappe.get_meta("Budget Costing Cost Item").get_field("applicable_charges"),
            currency=frappe.get_cached_value("Company", self.company, "default_currency"),
        )

        diff = flt(self.total_taxes_and_charges) - flt(total_applicable_charges)
        diff = flt(diff, precision)

        if abs(diff) < (2.0 / (10 ** precision)):
            self.items[-1].applicable_charges += diff
        else:
            frappe.throw(
                _(
                    "Total Applicable Charges in Purchase Order Items table must be same as Total Taxes and Charges"
                )
            )


class init_landed_taxes_and_totals(object):
    def __init__(self, doc):
        self.doc = doc
        self.tax_field = "taxes" if self.doc.doctype == "Budget Costing Voucher" else "additional_costs"
        self.set_account_currency()
        self.set_exchange_rate()
        self.set_amounts_in_company_currency()

    def set_account_currency(self):
        company_currency = erpnext.get_company_currency(self.doc.company)
        for d in self.doc.get(self.tax_field):
            if not d.account_currency:
                account_currency = frappe.db.get_value("Account", d.expense_account, "account_currency")
                d.account_currency = account_currency or company_currency

    def set_exchange_rate(self):
        company_currency = erpnext.get_company_currency(self.doc.company)
        for d in self.doc.get(self.tax_field):
            if d.account_currency == company_currency:
                d.exchange_rate = 1
            elif not d.exchange_rate:
                d.exchange_rate = get_exchange_rate(
                    self.doc.posting_date,
                    account=d.expense_account,
                    account_currency=d.account_currency,
                    company=self.doc.company,
                )

            if not d.exchange_rate:
                frappe.throw(_("Row {0}: Exchange Rate is mandatory").format(d.idx))

    def set_amounts_in_company_currency(self):
        for d in self.doc.get(self.tax_field):
            d.amount = flt(d.amount, d.precision("amount"))
            d.base_amount = flt(d.amount * flt(d.exchange_rate), d.precision("base_amount"))
