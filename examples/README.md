# Wizly Examples

This directory contains before/after samples to illustrate how Wizly transforms Magic xpa Web Client output.

## Example 1

**Before transformation:**
```html
<div 
    novalidate 
    [formGroup]="screenFormGroup" 
>
    <div 
        style="display: flex; flex-direction: column" 
        [magic]="mgc.FormElements" 
    >
        <div style="display: flex; flex-direction: row">
            <label 
                [magic]="mgc.lbl_inputTextDisabled" 
                class="lable_overflow" 
            >
                {{mg.getText(mgc.lbl_inputTextDisabled)}}
            </label>
        </div>
        <div style="display: flex; flex-direction: row">
            <div>
                <mat-form-field>
                    <div>
                        <input 
                            matInput 
                            [magic]="mgc.vt_inputTextDisabled" 
                            [placeholder]="mg.getPlaceholder(mgc.vt_inputTextDisabled)" 
                            [formControlName]="mgc.vt_inputTextDisabled" 
                            mgFormat 
                        >
                        <mgError [magic]=mgc.vt_inputTextDisabled> </mgError>
                    </div>
                </mat-form-field>
            </div>
            <button 
                mat-raised-button 
                color="primary" 
                [magic]="mgc.btn_disable" 
            >
                {{mg.getValue(mgc.btn_disable)}}
            </button>
        </div>
    </div>
</div>
```

**After transformation:**
```html
<!-- Changed by Wizly on 2026-02-15 at 16:20 -->
<form novalidate [formGroup]="screenFormGroup" [magic]="mgc.FormElements">
  <div class="d-flex flex-row">
    <span>{{mg.getText(mgc.lbl_inputTextDisabled)}}</span>
  </div>
  <div class="d-flex flex-row">
    <mat-form-field>
      <input 
        matInput 
        [magic]="mgc.vt_inputTextDisabled" 
        [placeholder]="mg.getPlaceholder(mgc.vt_inputTextDisabled)" 
        [formControlName]="mgc.vt_inputTextDisabled" 
        mgFormat 
      />
    </mat-form-field>
    <button mat-raised-button color="primary" [magic]="mgc.btn_disable">
      {{mg.getValue(mgc.btn_disable)}}
    </button>
  </div>
</form>
```

For more, see the repository README and `docs/rules.md`.