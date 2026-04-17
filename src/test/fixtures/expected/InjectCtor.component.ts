import { DummyService } from "./dummy.service";
import { Component, inject } from "@angular/core";
@Component({
  selector: "mga-InjectCtor_InjectCtor",
  standalone: false,
  templateUrl: "./InjectCtor.component.html"
})
export class InjectCtor {
  private readonly dummy: DummyService = inject(DummyService);
}
