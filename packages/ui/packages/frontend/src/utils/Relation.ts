/**
 * Maps an enum value to UI metadata such as labels and helper text.
 */
export interface RelationEntry<T extends string = string> {
    key: T;
    labelKey: string;
    helperTextKey?: string;
}

/**
 * Resolves the translated label for a relation entry.
 *
 * @param relation Relation mapping entries
 * @param key Enum value to resolve
 * @param translate i18n translate function
 * @returns Translated label or the raw key when missing
 */
export function getRelationLabel<T extends string>(
    relation: RelationEntry<T>[],
    key: T | string,
    translate: (labelKey: string) => string
): string {
    const entry = relation.find((item) => item.key === key);

    if (!entry) {
        return String(key);
    }

    return translate(entry.labelKey);
}
