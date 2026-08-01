/**
 * Theme colors and typography resolved from the surrounding UI.
 */
export interface ChartTheme {
    /**
     * Axis lines and tick label color.
     */
    axis: string;

    /**
     * Grid line color.
     */
    grid: string;

    /**
     * Canvas font for axis labels.
     */
    font: string;
}

/**
 * Reads chart colors from DaisyUI CSS variables on the chart container.
 *
 * @param container Chart mount element
 * @returns Theme-aware axis and grid colors
 */
export function resolveChartTheme(container: HTMLElement): ChartTheme {
    const style = getComputedStyle(container);
    const axis = style.getPropertyValue("--color-base-content").trim() || "#334155";
    const grid = style.getPropertyValue("--color-base-300").trim() || "#e2e8f0";
    const fontFamily = style.fontFamily || "ui-sans-serif, system-ui, sans-serif";

    return {
        axis,
        grid,
        font: `12px ${fontFamily}`
    };
}
