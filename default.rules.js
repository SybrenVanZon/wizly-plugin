module.exports = {
  rules: [
    {
      name: "Page",
      description:
        "Updates the base structure of the page and use the propper form tag",
      regex:
        /[\s\S]*<div\s*novalidate\s*\[formGroup\]="screenFormGroup"\s*>\s*<div[\s\S]*?\[magic\]="(?<magic>[\s\S]*?)"\s*>\s*(?<content>[\s\S]*?)\s*<\/div>\s*<\/div>\s*~~WIZLY_EOF~~$/gm,
      replacement:
        "<form novalidate [formGroup]=\"screenFormGroup\" [magic]=\"$<magic>\">\n$<content>\n</form>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Mat form fields",
      description:
        "Remove unnecessary divs from mat form fields and removes inconsistent error handling and reapply them propperly",
      regex:
        /<div>\s*<mat-form-field(?<formfield_attr>[\s\S]*?)>\s*(?:<div>\s*)?(?<content>[\s\S]*?)\s*(?:<mgError[\S\s]*<\/mgError>\s*)?\s*(?:<\/div>\s*)?<\/mat-form-field>\s*(?<extra>[\s\S]*?)<\/div>/gm,
      replacement: "<mat-form-field$<formfield_attr>>$<content></mat-form-field>$<extra>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Wrapping divs",
      description:
        "Remove unnecessary wrapper divs from varius form elements",
      regex:
        /<div>\s*(?<elem><(?:mat-select|mat-checkbox|mat-selection-list|editable-combo)\b[\s\S]*?<\/(?:mat-select|mat-checkbox|mat-selection-list|editable-combo)>)\s*<\/div>/gm,
      replacement: "$<elem>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Subforms",
      description: "Remove mat-card from subforms",
      regex:
        /<mat-card[\s\S]*>\s*(?<subform><magic-subform[\s\S]*<\/magic-subform>)\s*<\/mat-card>/gm,
      replacement: "$<subform>",
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
      replacement: "<span>$<content></span>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Visibility (bootstrap utility class)",
      description:
        "Remove inline styling in favor of class and also make it display none so it won't take up extra space",
      regex: /\[style\.visibility\]="(?<visibility>.*)"/gm,
      replacement: "[ngClass]=\"{'d-none':$<visibility>} === 'hidden'\"",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Flex row",
      description:
        "Replace inline styling of flex row with bootstrap utility class",
      regex: /<div style="display: flex; flex-direction: row">/gm,
      replacement: "<div class=\"d-flex flex-row\">",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Table",
      description: "Remove unnecessary divs from tables",
      regex:
        /<div\s*class="example-container[\S ]*?ContainerProps[\s\S]*?(?<table><mat-table[\s\S]*<\/mat-paginator>)\s*<\/div>/gm,
      replacement: "$<table>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Table - native",
      description:
        "Convert mat-table to native table to support better column handling en row and col span",
      regex: /<mat-table[\s\S](?<content>[\s\S]*)<\/mat-table>/gm,
      replacement: "<table mat-table $<content></table>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Table head row - native",
      description: "Replace mat-header-row with native tr",
      regex: /<mat-header-row[\s\S](?<prop>[\s\S]*)<\/mat-header-row>/gm,
      replacement: "<tr mat-header-row $<prop></tr>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Table row - native",
      description: "Replace mat-row with native tr",
      regex: /<mat-row[\s\S](?<prop>[\s\S]*)>\s*<\/mat-row>/gm,
      replacement:
        "<tr mat-row $<prop> [formGroup]=\"mg.getFormGroupByRow(row.rowId)\"></tr>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Table column head - native",
      description: "Replace mat-header-cell with native th",
      regex: /<mat-header-cell[\s\S](?<prop>[\s\S]*?)<\/mat-header-cell>/gm,
      replacement: "<th mat-header-cell $<prop></th>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Table column - native",
      description: "Replace mat-cell with native td",
      regex: /<mat-cell[\s\S](?<prop>[\s\S]*?)<\/mat-cell>/gm,
      replacement: "<td mat-cell $<prop></td>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Table remove formgroup divs",
      description: "Remove unnecessary formgroup divs from tables",
      regex:
        /<div\s*\[formGroup\]="mg.getFormGroupByRow\(row\.rowId\)"\s*(?:style="[\S\s]*?")?>[\s\S]*?(?<content>[\s\S]*?)<\/div>/gm,
      replacement: "$<content>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Table ngif divs",
      description: "Change divs with ngif to ng-container",
      regex:
        /<div\s*(?:style=".*?")?\s*\*ngIf="(?<if>.*?)"\s*>[\s\S]*?(?<content>[\S\s]*?)<\/div>/gm,
      replacement: "<ng-container *ngIf=\"$<if>\">$<content></ng-container>",
      active: true,
      replaceAfterBeautify: false,
      filePattern: "*.html",
    },
    {
      name: "Replace inner ngIf",
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
    {
      name: "Remove magic classes - native",
      description: "Remove default magic table classes",
      regex: /class="(table_row|container_border)"/gm,
      replacement: "",
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