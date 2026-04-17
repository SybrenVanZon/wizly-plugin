import {
  MgControlName,
  MgCustomProperties,
  MgFormControlsAccessor
} from "./OverlayTable.mg.controls.g";
import { MgDisplayedColumns } from "./OverlayTable.mg.controls.g";
import { Component } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { MagicModalInterface } from "@magic-xpa/angular";
import {
  BaseMatTableMagicComponent,
  matMagicProviders
} from "@magic-xpa/angular-material-core";
@Component({
  selector: "mga-OverlayTable_OverlayTable",
  providers: [...matMagicProviders],
  standalone: false,
  templateUrl: "./OverlayTable.component.html"
})
export class OverlayTable
  extends BaseMatTableMagicComponent
  implements MagicModalInterface
{
  mgc = MgControlName;
  mgcp = MgCustomProperties;
  mgfc!: MgFormControlsAccessor;
  mgdp = MgDisplayedColumns;
  override createFormControlsAccessor(formGroup: FormGroup) {
    this.mgfc = new MgFormControlsAccessor(formGroup, this.magicServices);
  }
  private static readonly formName: string = "OverlayTable";
  private static readonly showTitleBar: boolean = false;
  private static readonly x: number = 0;
  private static readonly y: number = 0;
  private static readonly width: string = "300px";
  private static readonly height: string = "300px";
  private static readonly isCenteredToWindow: boolean = true;
  private static readonly shouldCloseOnBackgroundClick: boolean = false;
  private static readonly isResizable: boolean = false;
  private static readonly isMovable: boolean = false;
  X() {
    return OverlayTable.x;
  }
  Y() {
    return OverlayTable.y;
  }
  Width(): string {
    return OverlayTable.width;
  }
  Height(): string {
    return OverlayTable.height;
  }
  IsCenteredToWindow() {
    return OverlayTable.isCenteredToWindow;
  }
  FormName() {
    return OverlayTable.formName;
  }
  ShowTitleBar() {
    return OverlayTable.showTitleBar;
  }
  ShouldCloseOnBackgroundClick() {
    return OverlayTable.shouldCloseOnBackgroundClick;
  }
  IsResizable() {
    return OverlayTable.isResizable;
  }
  IsMovable() {
    return OverlayTable.isMovable;
  }
  override displayedColumns = this.mgdp;
}
