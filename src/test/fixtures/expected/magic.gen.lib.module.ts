import {
  LazyLoadModulesMap,
  magicGenCmpsHash,
  magicGenComponents,
  title
} from "./component-list.g";
import { CommonModule } from "@angular/common";
import { NgModule, NgModuleRef } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatNativeDateModule } from "@angular/material/core";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatListModule } from "@angular/material/list";
import { MatPaginatorModule } from "@angular/material/paginator";
import { MatRadioModule } from "@angular/material/radio";
import { MatSelectModule } from "@angular/material/select";
import { MatSortModule } from "@angular/material/sort";
import { MatTableModule } from "@angular/material/table";
import { MatTabsModule } from "@angular/material/tabs";
import { MatTooltipModule } from "@angular/material/tooltip";
import { RouterModule } from "@angular/router";
import {
  ComponentListMagicService,
  ExitMagicService,
  MagicModule
} from "@magic-xpa/angular";
import { MagicAngularMaterialModule } from "@magic-xpa/angular-material-core";
import { DynamicModule } from "ng-dynamic-component";
import {
  NgxCurrencyDirective,
  NgxCurrencyInputMode,
  provideEnvironmentNgxCurrency
} from "ngx-currency";
import { InfiniteScrollDirective } from "ngx-infinite-scroll";
import { IConfig, NgxMaskModule } from "ngx-mask";
export const options: Partial<IConfig> | (() => Partial<IConfig>) = {};
@NgModule({
  declarations: [...magicGenComponents],
  exports: [...magicGenComponents, MagicModule],
  imports: [
    // Angular Modules
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    // Magic Modules
    DynamicModule,
    InfiniteScrollDirective,
    MagicModule,
    NgxCurrencyDirective,
    NgxMaskModule.forRoot(),
    // Material Modules
    MagicAngularMaterialModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatNativeDateModule,
    MatPaginatorModule,
    MatRadioModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
    MatTabsModule,
    MatTooltipModule
  ],
  providers: [
    ExitMagicService,
    provideEnvironmentNgxCurrency({
      align: "right",
      allowNegative: true,
      allowZero: true,
      decimal: ".",
      precision: 2,
      prefix: "",
      suffix: "",
      thousands: ",",
      nullable: true,
      min: undefined,
      max: undefined,
      inputMode: NgxCurrencyInputMode.Financial
    })
  ]
})
export class MagicGenLibModule {
  constructor(
    componentList: ComponentListMagicService,
    private moduleRef: NgModuleRef<any>
  ) {
    componentList.addComponents(magicGenCmpsHash, moduleRef);
    componentList.title = title;
    componentList.lazyLoadModulesMap = LazyLoadModulesMap;
  }
}
