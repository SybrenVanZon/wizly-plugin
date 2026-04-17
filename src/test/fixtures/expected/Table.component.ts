import {
  MgControlName,
  MgCustomProperties,
  MgFormControlsAccessor
} from "./Table.mg.controls.g";
import { MgDisplayedColumns } from "./Table.mg.controls.g";
import { Component } from "@angular/core";
import { FormGroup } from "@angular/forms";
import {
  BaseMatTableMagicComponent,
  matMagicProviders
} from "@magic-xpa/angular-material-core";
@Component({
  selector: "mga-Table_Table",
  providers: [...matMagicProviders],
  standalone: false,
  templateUrl: "./Table.component.html"
})
export class Table extends BaseMatTableMagicComponent {
  mgc = MgControlName;
  mgcp = MgCustomProperties;
  mgfc!: MgFormControlsAccessor;
  mgdp = MgDisplayedColumns;
  override createFormControlsAccessor(formGroup: FormGroup) {
    this.mgfc = new MgFormControlsAccessor(formGroup, this.magicServices);
  }
  override displayedColumns = this.mgdp;
}
