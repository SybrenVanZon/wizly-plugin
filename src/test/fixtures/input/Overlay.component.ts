 import { Component } from '@angular/core'; 
 
 import { FormGroup } from "@angular/forms"; 
 import { MgFormControlsAccessor, MgControlName, MgCustomProperties } from "./Overlay.mg.controls.g"; 
 
 
 import { TaskBaseMagicComponent, magicProviders } from "@magic-xpa/angular"; 
 
 
 import { MagicModalInterface } from "@magic-xpa/angular"; 
 
 @Component({ 
     selector: 'mga-Overlay_Overlay', 
     providers: [...magicProviders], 
     standalone: false, 
     templateUrl: './Overlay.component.html' 
 }) 
 export class Overlay extends TaskBaseMagicComponent implements MagicModalInterface { 
 
     mgc = MgControlName; 
     mgcp = MgCustomProperties; 
     mgfc!: MgFormControlsAccessor; 
     override createFormControlsAccessor(formGroup: FormGroup) { 
         this.mgfc = new MgFormControlsAccessor(formGroup, this.magicServices); 
     } 
     private static readonly formName: string = "Overlay"; 
     private static readonly showTitleBar: boolean = true; 
     private static readonly x: number = 0; 
     private static readonly y: number = 0; 
     private static readonly width: string = "300px"; 
     private static readonly height: string = "300px"; 
     private static readonly isCenteredToWindow: boolean = true; 
     private static readonly shouldCloseOnBackgroundClick: boolean = true; 
     private static readonly isResizable: boolean = true; 
     private static readonly isMovable: boolean = true; 
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
