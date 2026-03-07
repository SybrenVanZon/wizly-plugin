module.exports = {
  rules: [
    {
      name: "Page",
      description:
        "Updates the base structure of the page and use the propper form tag",
      regex:
        /[\s\S]*<div\s*novalidate\s*\[formGroup\]="screenFormGroup"\s*>[\s\S]*?<div[\s\S]*?\[magic\]="(?<magic>[\s\S]*?)"[\s\S]*?>\s*(?<content>[\s\S]*?)\s*<\/div>\s*<\/div>\s*~~WIZLY_EOF~~$/gm,
      templateFile: "page.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Button",
      description: "Converts magic buttons except zoom buttons",
      regex: /<button(?<inputAttrsBefore>[^>]*?)\[magic\]="(?<magic>.*?)"(?<inputAttrsAfter>[^>]*?)>(?!\s*\.\.\.\s*<\/button>)(?<content>[\s\S]*?)<\/button>/gm,
      templateFile: "button.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Tab",
      description: "Converts magic tabs to mat-tab-group (preserving content)",
      regex: /<div(?<inputAttrsBefore>[^>]*?)>\s*<mat-tab-group(?<groupAttrsBefore>[^>]*?)\[magic\]="(?<magic>.*?)"(?<groupAttrsAfter>[^>]*?)>[\s\S]*?<\/mat-tab-group>\s*(?<content>[\s\S]*?)<\/div>/gm,
      templateFile: "tab.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Subforms",
      description: "Remove mat-card from subforms",
      regex: /<mat-card(?<cardAttrsBefore>[^>]*?)\[style\.visibility\]="(?<attrVisible>.*?)"(?<cardAttrsAfter>[^>]*?)>\s*<magic-subform(?<subformAttrsBefore>[^>]*?)\[magic\]="(?<magic>.*?)"(?<subformAttrsAfter>[^>]*?)>[\s\S]*?<\/magic-subform>\s*<\/mat-card>/gm,
      templateFile: "subform.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Labels",
      description:
        "Replace labels with spans, labels should only be used for form elements",
      regex:
        /<label\s*\[magic\]="(?<magic>.*?)"(?<rowid>(?:\s*\[rowId\]="row\.rowId")?)\s*[\s\S]*?>\s*(?<content>[\s\S]*?)\s*<\/label>/gm,
      templateFile: "label.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Flex row",
      description:
        "Replace inline styling of flex row with bootstrap utility class",
      regex: /<div style="display: flex; flex-direction: row">/gm,
      templateFile: "flex-row.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Input - Checkbox",
      description: "Converts checkboxes (mat-checkbox) to clean mat-checkbox",
      regex: /<div>\s*<mat-checkbox(?<inputAttrsBefore>[\s\S]*?)\[magic\]="(?<magic>.*?)"(?<inputAttrsAfter>[\s\S]*?)>\s*(?<content>[\s\S]*?)\s*<\/mat-checkbox>\s*<\/div>/gm,
      templateFile: "checkbox.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html"
    },
    {
      name: "Input - Combo (Editable)",
      description: "Combobox with editable yes",
      regex: /<div>\s*<mat-form-field(?:\s+style="[^"]*")?\s*(?<formFieldAttrs>[^>]*)>[\s\S]*?<div>\s*<input(?:\s+matInput)?(?<inputAttrsBefore>[\s\S]*?)\[matAutocomplete\]="(?<autoName>.*?)"(?<inputAttrsAfter>[\s\S]*?)\[magic\]="(?<magic>.*?)"[\s\S]*?>\s*(?:<mat-autocomplete[\s\S]*?<\/mat-autocomplete>)?\s*(?:<mgError[\s\S]*?<\/mgError>)?\s*<\/div>\s*<\/mat-form-field>\s*<\/div>/gm,
      templateFile: "editable-combo.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html"
    },
    {
      name: "Input - Combo (Select)",
      description: "Converts non-editable combo boxes (mat-select) to clean mat-select with @for",
      regex: /<div>\s*<mat-form-field(?:\s+style="[^"]*")?\s*(?<formFieldAttrs>[^>]*)>[\s\S]*?<div>\s*<mat-select(?<inputAttrsBefore>[\s\S]*?)\[magic\]="(?<magic>.*?)"(?<inputAttrsAfter>[\s\S]*?)>[\s\S]*?<\/mat-select>\s*(?:<mgError[\s\S]*?<\/mgError>)?\s*<\/div>\s*<\/mat-form-field>\s*<\/div>/gm,
      templateFile: "select.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html"
    },
    {
      name: "Input - Radio",
      description: "Converts radio inputs to mat-radio-group",
      regex: /<div>\s*<mat-form-field(?:\s+style="[^"]*")?\s*(?<formFieldAttrs>[^>]*)>[\s\S]*?<div>\s*<input(?:\s+matInput)?(?<inputAttrsBefore>[\s\S]*?)type=['"]radio['"](?<inputAttrsAfter>[\s\S]*?)\[magic\]="(?<magic>.*?)"[\s\S]*?>\s*(?:<mgError[\s\S]*?<\/mgError>)?\s*<\/div>\s*<\/mat-form-field>\s*<\/div>/gm,
      templateFile: "radio.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html"
    },
    {
      name: "Input - Time",
      description: "Converts time inputs (type='time') to matTimepicker",
      regex: /<div>\s*<mat-form-field(?:\s+style="[^"]*")?\s*(?<formFieldAttrs>[^>]*)>[\s\S]*?<input(?:\s+matInput)?(?<inputAttrsBefore>[\s\S]*?)type=['"]time['"](?<inputAttrsAfter>[\s\S]*?)>[\s\S]*?<\/mat-form-field>\s*<\/div>/gm,
      templateFile: "input-time.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html"
    },
    {
      name: "Input - Date",
      description: "Converts date inputs with matDatepicker",
      regex: /<div>\s*<mat-form-field(?:\s+style="[^"]*")?\s*(?<formFieldAttrs>[^>]*)>[\s\S]*?<input(?:\s+matInput)?(?<inputAttrsBefore>[\s\S]*?)\[magic\]="(?<magic>.*?)"(?<inputAttrsAfter>[\s\S]*?)>[\s\S]*?<mat-datepicker-toggle(?<toggleAttrs>[\s\S]*?)>[\s\S]*?<\/mat-datepicker-toggle>\s*<mat-datepicker(?<datepickerAttrs>[\s\S]*?)><\/mat-datepicker>\s*<\/mat-form-field>\s*<\/div>/gm,
      templateFile: "input-date.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html"
    },
    {
      name: "Input - Autocomplete",
      description: "Converts inputs with autocomplete and optional zoom button",
      regex: /<div>\s*<mat-form-field(?:\s+style="[^"]*")?\s*(?<formFieldAttrs>[^>]*)>[\s\S]*?<div>\s*<input\s+matInput(?<inputAttrsBefore>[\s\S]*?)\[magic\]="(?<magic>.*?)"(?<inputAttrsAfter>[\s\S]*?)\[matAutocomplete\]="(?<autoName>.*?)"[\s\S]*?>\s*<mgError\s*\[magic\]=\k<magic>\s*>\s*<\/mgError>\s*<mat-autocomplete\s*#\k<autoName>="matAutocomplete"[\s\S]*?<\/mat-autocomplete>\s*<\/div>\s*<\/mat-form-field>\s*(?<zoom><button(?<zoomButtonAttrsBefore>[\s\S]*?)\[magic\]="\k<magic>"(?<zoomButtonAttrsAfter>[\s\S]*?)>[\s\S]*?<\/button>)?\s*<\/div>/gm,
      templateFile: "input-autocomplete.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html"
    },
    {
      name: "Input - Number",
      description: "Converts numeric inputs with currencyMask and optional zoom button",
      regex: /<div>\s*<mat-form-field(?:\s+style="[^"]*")?\s*(?<formFieldAttrs>[^>]*)>[\s\S]*?<div>\s*<input\s+matInput\s+currencyMask(?<inputAttrsBefore>[\s\S]*?)\[magic\]="(?<magic>.*?)"(?<inputAttrsAfter>[\s\S]*?)>\s*<mgError\s*\[magic\]=\k<magic>\s*>\s*<\/mgError>\s*<\/div>\s*<\/mat-form-field>\s*(?<zoom><button(?<zoomButtonAttrsBefore>[\s\S]*?)\[magic\]="\k<magic>"(?<zoomButtonAttrsAfter>[\s\S]*?)>[\s\S]*?<\/button>)?\s*<\/div>/gm,
      templateFile: "input-number.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html"
    },
    {
      name: "Input - Text",
      description: "Converts standard text inputs (and textareas) with optional zoom button",
      // regex: /<div>\s*<mat-form-field(?:\s+style="[^"]*")?\s*(?<formFieldAttrs>[^>]*)>[\s\S]*?<div>\s*(?:<input|<textarea)(?:\s+matInput)?(?<inputAttrsBefore>[\s\S]*?)\[magic\]="(?<magic>.*?)"(?<inputAttrsAfter>[\s\S]*?)>\s*<mgError\s*\[magic\]=\k<magic>\s*>\s*<\/mgError>\s*<\/div>\s*<\/mat-form-field>\s*(?<zoom><button(?<zoomButtonAttrsBefore>[\s\S]*?)\[magic\]="\k<magic>"(?<zoomButtonAttrsAfter>[\s\S]*?)>[\s\S]*?<\/button>)?\s*<\/div>/gm,
      regex: /<div>\s*(<mat-form-field\b[^>]*>)\s*<div>\s*(<input[\s\S]*?matInput\b[^>]*>)[\s\S]*?<\/mat-form-field>\s*(?<zoom><button[\s\S]*?>[\s\S]*?<\/button>)?\s*[\s\S]*?<\/div>/gm,
      templateFile: "input-text.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html"
    },
    {
      name: "Table",
      description: "Converts magic table structure to clean native table with material directives",
      regex:
        /(?<attr><div[^>]*>)\s*<mat-table[\s\S]*?>\s*(?<content>[\s\S]*?)\s*<mat-header-row[\s\S]*?<\/mat-paginator>\s*<\/div>/gm,
      templateFile: "table.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Table Column",
      description: "Converts magic table columns to clean native table columns",
      regex: /<ng-container\s*\[magic\]="(?<magic>.*?)"\s*\[matColumnDef\]="\k<magic>"\s*>\s*<mat-header-cell[\s\S]*?<\/mat-header-cell>\s*<mat-cell\b[^>]*magicMark="magicTableRowContainer"[^>]*>\s*<div\b[^>]*>\s*<div\b[^>]*>\s*(?<content>[\s\S]*?)\s*<\/div>\s*<\/div>\s*<\/mat-cell>\s*<\/ng-container>/gm,
      templateFile: "table-column.ejs",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Change ngIf to @if",
      description:
        "Replace inner ngIf to wrapping ng-container for future replace with @If and propper tab handling",
      regex:
        /<(?<tag>\w+)(?<beforeAttr>[^>]*)\s\*ngIf="(?<if>[^"]+)"(?<afterAttr>[^>]*)>(?<content>[\s\S]*?)<\/\1>/gm,
      replacement:
        "<ng-container *ngIf=\"$<if>\"><$<tag>$<beforeAttr>$<afterAttr>>$<content></$<tag>></ng-container>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
  ],
};