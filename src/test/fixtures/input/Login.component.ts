 import { Component } from '@angular/core'; 
 
 import { FormGroup } from "@angular/forms"; 
 import { MgFormControlsAccessor, MgControlName, MgCustomProperties } from "./Login.mg.controls.g"; 
 
 
 import { TaskBaseMagicComponent, magicProviders } from "@magic-xpa/angular"; 
 
 
 @Component({ 
     selector: 'mga-Login_Login', 
     providers: [...magicProviders], 
     standalone: false, 
     templateUrl: './Login.component.html' 
 }) 
 export class Login extends TaskBaseMagicComponent { 
 
     mgc = MgControlName; 
     mgcp = MgCustomProperties; 
     mgfc!: MgFormControlsAccessor; 
     override createFormControlsAccessor(formGroup: FormGroup) { 
         this.mgfc = new MgFormControlsAccessor(formGroup, this.magicServices); 
     } 
 }
