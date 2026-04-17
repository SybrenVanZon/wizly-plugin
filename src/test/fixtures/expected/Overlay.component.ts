import {
  MgControlName,
  MgCustomProperties,
  MgFormControlsAccessor
} from "./Overlay.mg.controls.g";
import { Component } from "@angular/core";
import { FormGroup } from "@angular/forms";
import {
  MagicModalInterface,
  magicProviders,
  TaskBaseMagicComponent
} from "@magic-xpa/angular";
@Component({
  selector: "mga-Overlay_Overlay",
  providers: [...magicProviders],
  standalone: false,
  templateUrl: "./Overlay.component.html"
})
export class Overlay
  extends TaskBaseMagicComponent
  implements MagicModalInterface
{
  mgc = MgControlName;
  mgcp = MgCustomProperties;
  mgfc!: MgFormControlsAccessor;
  override createFormControlsAccessor(formGroup: FormGroup) {
    this.mgfc = new MgFormControlsAccessor(formGroup, this.magicServices);
  }
  private static readonly formName: string = "Overlay";
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
    return Overlay.x;
  }
  Y() {
    return Overlay.y;
  }
  Width(): string {
    return Overlay.width;
  }
  Height(): string {
    return Overlay.height;
  }
  IsCenteredToWindow() {
    return Overlay.isCenteredToWindow;
  }
  FormName() {
    return Overlay.formName;
  }
  ShowTitleBar() {
    return Overlay.showTitleBar;
  }
  ShouldCloseOnBackgroundClick() {
    return Overlay.shouldCloseOnBackgroundClick;
  }
  IsResizable() {
    return Overlay.isResizable;
  }
  IsMovable() {
    return Overlay.isMovable;
  }
}
