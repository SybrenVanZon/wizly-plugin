declare module "@angular/common" {
  export const CommonModule: any;
}

declare module "@angular/core" {
  export const Component: any;
  export const NgModule: any;
  export type NgModuleRef<T = any> = any;
}

declare module "@angular/forms" {
  export type FormGroup = any;
  export const ReactiveFormsModule: any;
}

declare module "@angular/router" {
  export const RouterModule: any;
}

declare module "ng-dynamic-component" {
  export const DynamicModule: any;
}

declare module "ngx-infinite-scroll" {
  export const InfiniteScrollDirective: any;
}

declare module "@magic-xpa/angular" {
  export class ComponentListMagicService {
    addComponents(...args: any[]): void;
    title: any;
    lazyLoadModulesMap: any;
  }
  export class TaskBaseMagicComponent {
    magicServices: any;
    createFormControlsAccessor(..._args: any[]): void;
  }
  export const magicProviders: any[];
  export const MagicModule: any;
  export class ExitMagicService {}
}

declare module "@magic-xpa/angular-material-core" {
  export const MagicAngularMaterialModule: any;
}

declare module "@angular/material/form-field" {
  export const MatFormFieldModule: any;
}

declare module "@angular/material/select" {
  export const MatSelectModule: any;
}

declare module "@angular/material/paginator" {
  export const MatPaginatorModule: any;
}

declare module "@angular/material/list" {
  export const MatListModule: any;
}

declare module "@angular/material/input" {
  export const MatInputModule: any;
}

declare module "@angular/material/radio" {
  export const MatRadioModule: any;
}

declare module "@angular/material/datepicker" {
  export const MatDatepickerModule: any;
}

declare module "@angular/material/sort" {
  export const MatSortModule: any;
}

declare module "@angular/material/table" {
  export const MatTableModule: any;
}

declare module "@angular/material/checkbox" {
  export const MatCheckboxModule: any;
}

declare module "@angular/material/card" {
  export const MatCardModule: any;
}

declare module "@angular/material/core" {
  export const MatNativeDateModule: any;
}

declare module "@angular/material/tabs" {
  export const MatTabsModule: any;
}

declare module "@angular/material/tooltip" {
  export const MatTooltipModule: any;
}

declare module "@angular/material/button" {
  export const MatButtonModule: any;
}

declare module "@angular/material/autocomplete" {
  export const MatAutocompleteModule: any;
}

declare module "@angular/material/icon" {
  export const MatIconModule: any;
}

declare module "ngx-currency" {
  export const NgxCurrencyDirective: any;
  export const NgxCurrencyInputMode: any;
  export function provideEnvironmentNgxCurrency(...args: any[]): any;
}

declare module "ngx-mask" {
  export interface IConfig {}
  export const NgxMaskModule: any;
}
