import { Component } from "@angular/core";
import { MagicModalInterface } from "@magic-xpa/angular";

@Component({
  selector: "mga-OverlayKeep_OverlayKeep",
  standalone: false,
  templateUrl: "./OverlayKeep.component.html"
})
export class OverlayKeep implements MagicModalInterface {
  private static readonly showTitleBar: boolean = true;
  private static readonly shouldCloseOnBackgroundClick: boolean = true; // WIZLY:KEEP
  private static readonly isResizable: boolean = true;
  private static readonly isMovable: boolean = true;
  X() {
    return 0;
  }
  Y() {
    return 0;
  }
  Width(): string {
    return "300px";
  }
  Height(): string {
    return "300px";
  }
}
