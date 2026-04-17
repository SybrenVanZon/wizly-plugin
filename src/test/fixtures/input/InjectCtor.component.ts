import { Component } from "@angular/core";
import { DummyService } from "./dummy.service";

@Component({
  selector: "mga-InjectCtor_InjectCtor",
  standalone: false,
  templateUrl: "./InjectCtor.component.html"
})
export class InjectCtor {
  constructor(private readonly dummy: DummyService) {}
}
