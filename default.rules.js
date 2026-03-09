module.exports = {
  rules: [
    {
      name: "Page",
      description:"Updates the base structure of the page and use the propper form tag",
      regex: /[\s\S]*<div\s*novalidate\s*\[formGroup\]="screenFormGroup"\s*>[\s\S]*?<div[\s\S]*?\[magic\]="(?<magic>[\s\S]*?)"[\s\S]*?>\s*(?<content>[\s\S]*?)\s*<\/div>\s*<\/div>\s*~~WIZLY_EOF~~$/gm,
      templateFile: "page.ejs",
      active: true,
      filePattern: "*.html",
    },
    {
      name: "Button",
      description: "Converts magic buttons except zoom buttons",
      regex: /<button(?<inputAttrsBefore>[^>]*?)\[magic\]="(?<magic>.*?)"(?<inputAttrsAfter>[^>]*?)>(?!\s*\.\.\.\s*<\/button>)(?<content>[\s\S]*?)<\/button>/gm,
      templateFile: "button.ejs",
      active: true,
      filePattern: "*.html",
    },
    {
      name: "Tab",
      description: "Converts magic tabs to mat-tab-group (preserving content)",
      regex: /<div(?<inputAttrsBefore>[^>]*?)>\s*<mat-tab-group(?<groupAttrsBefore>[^>]*?)\[magic\]="(?<magic>.*?)"(?<groupAttrsAfter>[^>]*?)>[\s\S]*?<\/mat-tab-group>\s*(?<content>[\s\S]*?)<\/div>/gm,
      templateFile: "tab.ejs",
      active: true,
      filePattern: "*.html",
    },
    {
      name: "Subforms",
      description: "Remove mat-card from subforms",
      regex: /<mat-card(?<cardAttrsBefore>[^>]*?)\[style\.visibility\]="(?<attrVisible>.*?)"(?<cardAttrsAfter>[^>]*?)>\s*<magic-subform(?<subformAttrsBefore>[^>]*?)\[magic\]="(?<magic>.*?)"(?<subformAttrsAfter>[^>]*?)>[\s\S]*?<\/magic-subform>\s*<\/mat-card>/gm,
      templateFile: "subform.ejs",
      active: true,
      filePattern: "*.html",
    },
    {
      name: "Labels",
      description: "Replace labels with spans, labels should only be used for form elements",
      regex: /<label\s*\[magic\]="(?<magic>.*?)"(?<rowid>(?:\s*\[rowId\]="row\.rowId")?)\s*[\s\S]*?>\s*(?<content>[\s\S]*?)\s*<\/label>/gm,
      templateFile: "label.ejs",
      active: true,

      filePattern: "*.html",
    },
    {
      name: "Flex row",
      description: "Replace inline styling of flex row with bootstrap utility class",
      regex: /<div style="display: flex; flex-direction: row">/gm,
      templateFile: "flex-row.ejs",
      active: true,
      filePattern: "*.html",
    },
    {
      name: "Input - Checkbox",
      description: "Converts checkboxes (mat-checkbox) to clean mat-checkbox",
      regex: /<div>\s*<mat-checkbox(?<inputAttrsBefore>[\s\S]*?)\[magic\]="(?<magic>.*?)"(?<inputAttrsAfter>[\s\S]*?)>\s*(?<content>[\s\S]*?)\s*<\/mat-checkbox>\s*<\/div>/gm,
      templateFile: "checkbox.ejs",
      active: true,
      filePattern: "*.html"
    },
    {
      name: "Input - Combo (Editable)",
      description: "Combobox with editable yes",
      regex: /<div>\s*(?<input><editable-combo[\s\S]*?<\/editable-combo>)[\s\S]*?<\/div>/gm,
      templateFile: "editable-combo.ejs",
      active: true,
      filePattern: "*.html"
    },
    {
      name: "Input - Combo (Select)",
      description: "Converts non-editable combo boxes (mat-select) to clean mat-select with @for",
      regex: /<div>\s*(?<formField><mat-form-field[\s\S]*?)(?<input><mat-select[\s\S]*?<\/mat-select>)\s*<\/mat-form-field>[\s\S]*?<\/div>/gm,
      templateFile: "select.ejs",
      active: true,
      filePattern: "*.html"
    },
    {
      name: "Input - Radio",
      description: "Converts radio inputs to mat-radio-group",
      regex: /<div>\s*<mat-form-field(?:\s+style="[^"]*")?\s*(?<formFieldAttrs>[^>]*)>[\s\S]*?<div>\s*<input(?:\s+matInput)?(?<inputAttrsBefore>[\s\S]*?)type=['"]radio['"](?<inputAttrsAfter>[\s\S]*?)\[magic\]="(?<magic>.*?)"[\s\S]*?>\s*(?:<mgError[\s\S]*?<\/mgError>)?\s*<\/div>\s*<\/mat-form-field>\s*<\/div>/gm,
      templateFile: "radio.ejs",
      active: true,
      filePattern: "*.html"
    },
    {
      name: "Input",
      description: "Converts all input types (text, date, time, number, autocomplete) with optional zoom button",
      regex: /<div>\s*(?<formField><mat-form-field\b[^>]*>)\s*(<div>)?\s*(?<input><input[\s\S]*?matInput\b[^>]*>)[\s\S]*?<\/mat-form-field>\s*(?<zoom><button[\s\S]*?>[\s\S]*?<\/button>)?\s*[\s\S]*?<\/div>/gm,
      templateFile: "input-base.ejs",
      active: true,
      filePattern: "*.html"
    },
    {
      name: "Table",
      description: "Converts magic table structure to clean native table with material directives",
      regex: /(?<table><div[^>]*>)\s*<mat-table[\s\S]*?>\s*(?<content>[\s\S]*?)\s*<mat-header-row[\s\S]*?<\/mat-paginator>\s*<\/div>/gm,
      templateFile: "table.ejs",
      active: true,
      filePattern: "*.html",
    },
    {
      name: "Table Column",
      description: "Converts magic table columns to clean native table columns",
      regex: /<ng-container\s*\[magic\]="(?<magic>.*?)"\s*\[matColumnDef\]="\k<magic>"\s*>\s*<mat-header-cell[\s\S]*?<\/mat-header-cell>\s*<mat-cell\b[^>]*magicMark="magicTableRowContainer"[^>]*>\s*<div\b[^>]*>\s*<div\b[^>]*>\s*(?<content>[\s\S]*?)\s*<\/div>\s*<\/div>\s*<\/mat-cell>\s*<\/ng-container>/gm,
      templateFile: "table-column.ejs",
      active: true,
      filePattern: "*.html",
    }
  ],
};