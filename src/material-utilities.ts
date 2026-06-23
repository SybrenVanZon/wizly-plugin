const DEFAULT_MATERIAL_UTILITY_KEYS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', 'A100', 'A200', 'A400', 'A700'];

export function getMaterialUtilityKeys(): string[] {
    return [...DEFAULT_MATERIAL_UTILITY_KEYS];
}

export function renderMaterialUtilityClasses(groupName: string, keys = getMaterialUtilityKeys()): string {
    const lines: string[] = [];
    lines.push(`.mat-bg-${groupName} {`);
    lines.push(`  background-color: var(--wizly-mat-${groupName});`);
    lines.push(`  color: var(--wizly-mat-on-${groupName});`);
    lines.push(`}`);
    lines.push('');
    lines.push(`.mat-text-${groupName} {`);
    lines.push(`  color: var(--wizly-mat-${groupName});`);
    lines.push(`}`);
    lines.push('');
    lines.push(`.mat-border-${groupName} {`);
    lines.push(`  border-color: var(--wizly-mat-${groupName});`);
    lines.push(`}`);
    lines.push('');
    lines.push(`.mat-fill-${groupName} {`);
    lines.push(`  fill: var(--wizly-mat-${groupName});`);
    lines.push(`}`);
    lines.push('');

    for (const key of keys) {
        lines.push(`.mat-bg-${groupName}-${key} {`);
        lines.push(`  background-color: var(--wizly-mat-${groupName}-${key});`);
        lines.push(`  color: var(--wizly-mat-on-${groupName}-${key});`);
        lines.push(`}`);
        lines.push('');
        lines.push(`.mat-text-${groupName}-${key} {`);
        lines.push(`  color: var(--wizly-mat-${groupName}-${key});`);
        lines.push(`}`);
        lines.push('');
        lines.push(`.mat-border-${groupName}-${key} {`);
        lines.push(`  border-color: var(--wizly-mat-${groupName}-${key});`);
        lines.push(`}`);
        lines.push('');
        lines.push(`.mat-fill-${groupName}-${key} {`);
        lines.push(`  fill: var(--wizly-mat-${groupName}-${key});`);
        lines.push(`}`);
        lines.push('');
    }

    return lines.join('\n').trimEnd();
}

export function renderAllMaterialUtilityClasses(groupNames = ['primary', 'secondary', 'warn']): string {
    return groupNames.map((groupName) => renderMaterialUtilityClasses(groupName)).join('\n\n');
}
