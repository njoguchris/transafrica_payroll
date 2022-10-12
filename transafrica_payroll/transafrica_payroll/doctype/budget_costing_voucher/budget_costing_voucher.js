// Copyright (c) 2022, Christopher Njogu and contributors
// For license information, please see license.txt

// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

{% include 'transafrica_payroll/transafrica_payroll/budget_taxes_and_charges_common.js' %};

frappe.provide("erpnext.stock");
var counter = 0;
erpnext.stock.BudgetCostingVoucher = erpnext.stock.StockController.extend({
   setup: function() {
      var me = this;
      this.frm.fields_dict.purchase_receipts.grid.get_field('receipt_document').get_query =
         function (doc, cdt, cdn) {
            var d = locals[cdt][cdn]

            var filters = [
               [d.receipt_document_type, 'docstatus', '=', '1'],
               [d.receipt_document_type, 'company', '=', me.frm.doc.company],
            ]

            if (!me.frm.doc.company) frappe.msgprint(__("Please enter company first"));
            return {
               filters: filters
            }
         };

      this.frm.add_fetch("receipt_document", "supplier", "supplier");
      this.frm.add_fetch("receipt_document", "transaction_date", "transaction_date");
      this.frm.add_fetch("receipt_document", "base_grand_total", "grand_total");
   },

   refresh: function() {
       if (this.frm.doc.company) {
         let company_currency = frappe.get_doc("Company", this.frm.doc.company).default_currency;
         this.frm.set_currency_labels(["total_taxes_and_charges"], company_currency);
      }
       if(frm.doc.__islocal){
	        frm.set_value("duty_added", "No");
	    }
   },

   get_items_from_purchase_receipts: function() {
      var me = this;
      if(!this.frm.doc.purchase_receipts.length) {
         frappe.msgprint(__("Please enter Purchase Order first"));
      } else {
         return this.frm.call({
            doc: me.frm.doc,
            method: "get_items_from_purchase_receipts",
            callback: function(r, rt) {
               me.set_applicable_charges_for_item();
            }
         });
      }
   },

   amount: function(frm) {
      this.set_total_taxes_and_charges();
      this.set_applicable_charges_for_item();
   },

   set_total_taxes_and_charges: function() {
      var total_taxes_and_charges = 0.0;
      $.each(this.frm.doc.taxes || [], function(i, d) {
         total_taxes_and_charges += flt(d.base_amount);
      });
      this.frm.set_value("total_taxes_and_charges", total_taxes_and_charges);
   },

   set_applicable_charges_for_item: function() {
      var me = this;

      if(this.frm.doc.taxes.length) {
         var total_item_cost = 0.0;
         var based_on = this.frm.doc.distribute_charges_based_on.toLowerCase();

         if (based_on != 'distribute manually') {
            $.each(this.frm.doc.items || [], function(i, d) {
               total_item_cost += flt(d[based_on])
            });

            var total_charges = 0.0;
            $.each(this.frm.doc.items || [], function(i, item) {
               item.applicable_charges = flt(item[based_on]) * flt(me.frm.doc.total_taxes_and_charges) / flt(total_item_cost)
               item.applicable_charges = flt(item.applicable_charges, precision("applicable_charges", item))
               total_charges += item.applicable_charges
            });

            if (total_charges != this.frm.doc.total_taxes_and_charges){
               var diff = this.frm.doc.total_taxes_and_charges - flt(total_charges)
               this.frm.doc.items.slice(-1)[0].applicable_charges += diff
            }
            refresh_field("items");
         }
      }
   },
   distribute_charges_based_on: function (frm, cdt, cdn) {
      this.set_applicable_charges_for_item();
       if( this.frm.doc.distribute_charges_based_on == "Distribute Manually" &&  this.frm.doc.company == "Tirida"){
	         this.frm.doc.items.forEach(child_doc => {
	            frappe.model.set_value(child_doc.doctype,child_doc.name,"actual_cost", (child_doc.applicable_charges + child_doc.amount ))
	  frappe.call(
                    {
                        method: "frappe.client.get_list",
                        args: {
                            doctype: "Item Price",
                            filters: {
                            	price_list: ['in', ["Dealer","CASH","TRADE"]],
                                item_code: child_doc.item_code
                            },
                            fields:["price_list_rate","price_list"],
                            limit_page_length: 3
                        },
                        callback: function(r)
                            {
                                var prices = r.message;
                                prices.forEach(function(d) {
                                    if(d.price_list === "Dealer"){
                                        frappe.model.set_value(child_doc.doctype,child_doc.name,"dealer", d.price_list_rate)
                                    }else if(d.price_list === "TRADE"){
                                        frappe.model.set_value(child_doc.doctype,child_doc.name,"trader", d.price_list_rate)
                                    }else if(d.price_list === "CASH"){
                                        frappe.model.set_value(child_doc.doctype,child_doc.name,"cash", d.price_list_rate)
                                    }else{
                                          frappe.model.set_value(child_doc.doctype,child_doc.name,"Cash", 0)
                                          frappe.model.set_value(child_doc.doctype,child_doc.name,"Trader", 0)
                                          frappe.model.set_value(child_doc.doctype,child_doc.name,"Cash", 0)
                                    }
                                });
                            }
                    });

            });
         refresh_field('items');
	    }

	    if( this.frm.doc.distribute_charges_based_on == "Distribute Manually" &&  this.frm.doc.company == "TAW TZ"){
	        frm.doc.items.forEach(child_doc => {
	            frappe.model.set_value(child_doc.doctype,child_doc.name,"actual_cost", (child_doc.applicable_charges + child_doc.amount ))
	  frappe.call(
                    {
                        method: "frappe.client.get_list",
                        args: {
                            doctype: "Item Price",
                            filters: {
                                price_list: ['in', ["Dealer","CASH","TRADE"]],
                                item_code: child_doc.item_code
                            },
                            fields:["price_list_rate","price_list"],
                            limit_page_length: 3
                        },
                        callback: function(r)
                            {
                                var prices = r.message;
                                prices.forEach(function(d) {
                                    if(d.price_list === "Dealer"){
                                        frappe.model.set_value(child_doc.doctype,child_doc.name,"dealer", d.price_list_rate)
                                    }else if(d.price_list === "TRADE"){
                                        frappe.model.set_value(child_doc.doctype,child_doc.name,"trader", d.price_list_rate)
                                    }else if(d.price_list === "CASH"){
                                        frappe.model.set_value(child_doc.doctype,child_doc.name,"cash", d.price_list_rate)
                                    }else{
                                          frappe.model.set_value(child_doc.doctype,child_doc.name,"cash", 0)
                                          frappe.model.set_value(child_doc.doctype,child_doc.name,"trader", 0)
                                          frappe.model.set_value(child_doc.doctype,child_doc.name,"cash", 0)
                                    }
                                });
                            }
                    });

            });
        frm.refresh_field('items');
	    }

   },

   items_remove: () => {
      this.trigger('set_applicable_charges_for_item');
   },
	before_cancel: function(){
	    frm.set_value("duty_added", "No");
	},
	before_save: function(){
	   if(this.frm.doc.distribute_charges_based_on == "Distribute Manually" && this.frm.doc.duty_added =="No"){
	       var total_duty = 0;
	       this.frm.doc.items.forEach(child_doc => {
	           total_duty += child_doc.item_duty;
	           var item_duty = child_doc.item_duty;
	          var total_charges = item_duty + child_doc.applicable_charges;
	         this.frappe.model.set_value(child_doc.doctype,child_doc.name,"applicable_charges", total_charges)

	       });
	      this.frm.refresh_field('items');

	       if(total_duty >0){
	           if(this.frm.doc.company == "TAW TZ"){
	               	           this.frm.add_child('taxes', {
                                expense_account: "VAT - TT",
                                description: "Duty",
                                amount:total_duty
                });
                this.frm.refresh_field('taxes');
                counter = 1;
	           }
	           if(this.frm.doc.company == "Tirida"){
	               	           this.frm.add_child('taxes', {
                                expense_account: "VAT - T",
                                description: "Duty",
                                amount:total_duty
                });
                this.frm.refresh_field('taxes');
                counter = 1;
	           }

	       }

	    frm.set_value("duty_added", "Yes")
	   }

	},
});

cur_frm.script_manager.make(erpnext.stock.BudgetCostingVoucher);

frappe.ui.form.on('Budget Costing Taxes and Charges', {
   expense_account: function(frm, cdt, cdn) {
      frm.events.set_account_currency(frm, cdt, cdn);
   },

   amount: function(frm, cdt, cdn) {
      frm.events.set_base_amount(frm, cdt, cdn);
   }
});
frappe.ui.form.on('Budget Costing Cost Item', {
item_duty: function(frm,cdt,cdn){
	    var items = locals[cdt][cdn];
	    frappe.model.set_value(items.doctype,items.name,"actual_cost", (items.applicable_charges + items.item_duty + items.amount ))
	     refresh_field('items');
	},
	actual_cost: function(frm,cdt,cdn){
	    var items = locals[cdt][cdn];
	    frappe.model.set_value(items.doctype,items.name,"actual_unit_cost", (items.actual_cost /items.qty))
	    frappe.model.set_value(items.doctype,items.name,"ratio", ((items.item_duty + items.applicable_charges) /items.amount))
	    refresh_field('items');
	}

});
