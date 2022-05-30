// Copyright (c) 2022, Christopher Njogu and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Bank Reconciliation Statement (Combined)"] = {
	"filters": [
		{
			"fieldname":"company",
			"label": __("Company"),
			"fieldtype": "Link",
			"options": "Company",
			"reqd": 1,
			"default": frappe.defaults.get_user_default("Company")
		},
		{
			"fieldname":"account",
			"label": __("Bank Account"),
			"fieldtype": "Link",
			"options": "Account",
			"default": frappe.defaults.get_user_default("Company")?
				locals[":Company"][frappe.defaults.get_user_default("Company")]["default_bank_account"]: "",
			"reqd": 1,
			"get_query": function() {
				var company = frappe.query_report.get_filter_value('company')
				return {
					"query": "erpnext.controllers.queries.get_account_list",
					"filters": [
						['Account', 'account_type', 'in', 'Bank, Cash'],
						['Account', 'is_group', '=', 0],
						['Account', 'disabled', '=', 0],
						['Account', 'company', '=', company],
					]
				}
			}
		},
		{
			"fieldname":"from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			// "default": frappe.datetime.get_today(),
			"reqd": 1
		},
		{
			"fieldname":"report_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 1
		},
	]
};
