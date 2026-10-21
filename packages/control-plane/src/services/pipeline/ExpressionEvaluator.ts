/**
 * Evaluates simple pipeline `when` expressions against a variable bag.
 */
export namespace ExpressionEvaluator {
    /**
     * Variable context for expression evaluation.
     */
    export interface Context {
        branch?: string;
        commitSha?: string;
        [key: string]: string | undefined;
    }

    /**
     * Returns true when the expression is empty or evaluates truthy.
     *
     * @param expression Expression string or undefined
     * @param context Variable bindings
     * @returns Whether the condition passes
     */
    export function evaluateWhen(expression: string | undefined, context: Context): boolean {
        if (!expression || !expression.trim()) {
            return true;
        }

        return Boolean(evaluateExpression(expression.trim(), context));
    }

    /**
     * Evaluates a boolean expression.
     *
     * @param expression Source expression
     * @param context Variable bindings
     * @returns Coerced boolean result
     */
    function evaluateExpression(expression: string, context: Context): unknown {
        const orParts = splitTopLevel(expression, "||");

        for (const orPart of orParts) {
            const andParts = splitTopLevel(orPart, "&&");
            let andResult = true;

            for (const andPart of andParts) {
                if (!evaluateAtom(andPart.trim(), context)) {
                    andResult = false;
                    break;
                }
            }

            if (andResult) {
                return true;
            }
        }

        return false;
    }

    /**
     * Evaluates a single comparison or function call.
     *
     * @param atom Atomic expression
     * @param context Variable bindings
     * @returns Truthy when the atom holds
     */
    function evaluateAtom(atom: string, context: Context): boolean {
        const startsWithMatch = /^startsWith\(\s*(\w+)\s*,\s*['"]([^'"]+)['"]\s*\)$/.exec(atom);

        if (startsWithMatch) {
            const value = readVar(startsWithMatch[1], context) ?? "";
            return value.startsWith(startsWithMatch[2]);
        }

        const containsMatch = /^contains\(\s*(\w+)\s*,\s*['"]([^'"]+)['"]\s*\)$/.exec(atom);

        if (containsMatch) {
            const value = readVar(containsMatch[1], context) ?? "";
            return value.includes(containsMatch[2]);
        }

        const matchesMatch = /^matches\(\s*(\w+)\s*,\s*['"]([^'"]+)['"]\s*\)$/.exec(atom);

        if (matchesMatch) {
            const value = readVar(matchesMatch[1], context) ?? "";
            return new RegExp(matchesMatch[2]).test(value);
        }

        const eqMatch = /^(\w+)\s*==\s*['"]([^'"]+)['"]$/.exec(atom);

        if (eqMatch) {
            return readVar(eqMatch[1], context) === eqMatch[2];
        }

        const neMatch = /^(\w+)\s*!=\s*['"]([^'"]+)['"]$/.exec(atom);

        if (neMatch) {
            return readVar(neMatch[1], context) !== neMatch[2];
        }

        return false;
    }

    /**
     * Splits on a top-level operator without breaking quoted strings.
     *
     * @param expression Full expression
     * @param operator Operator token
     * @returns Parts split at top level
     */
    function splitTopLevel(expression: string, operator: string): string[] {
        const parts: string[] = [];
        let depth = 0;
        let current = "";

        for (let i = 0; i < expression.length; i++) {
            if (expression[i] === "(") {
                depth++;
                current += expression[i];
                continue;
            }

            if (expression[i] === ")") {
                depth--;
                current += expression[i];
                continue;
            }

            if (depth === 0 && expression.slice(i, i + operator.length) === operator) {
                parts.push(current);
                current = "";
                i += operator.length - 1;
                continue;
            }

            current += expression[i];
        }

        if (current) {
            parts.push(current);
        }

        return parts;
    }

    /**
     * Reads a variable from the context.
     *
     * @param name Variable name
     * @param context Bindings
     * @returns Value or undefined
     */
    function readVar(name: string, context: Context): string | undefined {
        const value = context[name];

        if (typeof value === "string") {
            return value;
        }

        return undefined;
    }
}
