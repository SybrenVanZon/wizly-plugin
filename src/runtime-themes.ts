export type RuntimeThemeVariantMode = 'light' | 'dark';

export type DetectedRuntimeTheme = {
    name: string;
    href: string;
    mode?: RuntimeThemeVariantMode;
};

function titleize(value: string): string {
    return value.replace(/\b\w/g, (m) => m.toUpperCase());
}

export function inferRuntimeThemeMode(...candidates: Array<string | undefined>): RuntimeThemeVariantMode | undefined {
    for (const candidate of candidates) {
        const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
        if (!trimmed) { continue; }
        const normalized = trimmed
            .replace(/\.css$/i, '')
            .replace(/\.theme$/i, '')
            .replace(/(?:[-_\s]?theme)$/i, '')
            .trim();
        const match = normalized.match(/(?:^|[-_\s])(light|dark)$/i);
        if (match) {
            return match[1].toLowerCase() as RuntimeThemeVariantMode;
        }
    }
    return undefined;
}

export function deriveRuntimeThemeName(value: string, mode?: RuntimeThemeVariantMode): string {
    const trimmed = value.trim();
    const normalized = trimmed
        .replace(/\.css$/i, '')
        .replace(/\.theme$/i, '')
        .replace(/(?:[-_\s]?theme)$/i, '')
        .trim();
    const stripped = mode
        ? normalized.replace(new RegExp(`(?:[-_\\s]+)?${mode}$`, 'i'), '').trim()
        : normalized;
    const source = stripped || normalized || trimmed;
    const spaced = source.replace(/[_-]+/g, ' ').trim();
    return spaced ? titleize(spaced) : value;
}

export function detectRuntimeThemeFromBundleName(bundleName: string): DetectedRuntimeTheme {
    const trimmed = bundleName.trim();
    const mode = inferRuntimeThemeMode(trimmed);
    return {
        name: deriveRuntimeThemeName(trimmed, mode),
        href: `${trimmed}.css`,
        mode
    };
}
