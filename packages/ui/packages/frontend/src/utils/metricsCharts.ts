import uPlot from "uplot";

import { resolveChartTheme } from "./chartTheme";
import { formatPercentAxisValue } from "./formatMetrics";

/**
 * Configuration for a metrics time-series chart.
 */
export interface MetricsPlotConfig {
    /**
     * Series label shown in the legend.
     */
    label: string;

    /**
     * Line color.
     */
    color: string;

    /**
     * Locale used for the time axis.
     */
    locale: string;

    /**
     * Optional fixed maximum for the Y axis.
     */
    yMax?: number;

    /**
     * Formats Y axis ticks and legend values.
     */
    formatY: (value: number) => string;

    /**
     * Short unit label rendered on the Y axis (for example "%").
     */
    yAxisLabel?: string;
}

/**
 * Builds uPlot scale options for a metrics chart.
 *
 * @param yMax Optional fixed Y maximum
 * @returns Scale configuration
 */
function buildScales(yMax?: number): uPlot.Options["scales"] {
    if (yMax === undefined) {
        return {
            x: {
                time: true
            }
        };
    }

    return {
        x: {
            time: true
        },
        y: {
            auto: false,
            range: [0, yMax]
        }
    };
}

/**
 * Renders or updates a metrics chart with labeled axes.
 *
 * @param container Target element
 * @param data uPlot data tuple
 * @param config Chart configuration
 * @param existing Existing plot instance
 * @returns Updated plot instance
 */
export function renderMetricsPlot(
    container: HTMLElement | null,
    data: [number[], number[]],
    config: MetricsPlotConfig,
    existing: uPlot | null
): uPlot | null {
    if (!container) {
        return existing;
    }

    existing?.destroy();

    const theme = resolveChartTheme(container);
    const timeFormatter = new Intl.DateTimeFormat(config.locale, {
        hour: "2-digit",
        minute: "2-digit"
    });
    const width = Math.max(container.clientWidth, 280);

    const yAxis: uPlot.Axis = {
        side: 3,
        size: 56,
        stroke: theme.axis,
        font: theme.font,
        label: config.yAxisLabel ?? "",
        labelSize: 12,
        labelGap: 8,
        grid: {
            stroke: theme.grid
        },
        ticks: {
            show: true,
            stroke: theme.axis
        },
        values: (_plot, splits) => (
            Array.isArray(splits)
                ? splits.map((value) => config.formatY(value))
                : []
        )
    };

    try {
        return new uPlot(
            {
                width,
                height: 220,
                scales: buildScales(config.yMax),
                series: [
                    {},
                    {
                        label: config.label,
                        stroke: config.color,
                        width: 2,
                        points: {
                            show: true,
                            size: 4,
                            stroke: config.color,
                            fill: config.color
                        },
                        value: (_plot, value) => (value == null ? "-" : config.formatY(value))
                    }
                ],
                axes: [
                    {
                        side: 2,
                        size: 40,
                        stroke: theme.axis,
                        font: theme.font,
                        grid: {
                            show: false
                        },
                        ticks: {
                            show: true,
                            stroke: theme.axis
                        },
                        values: (_plot, splits) => (
                            Array.isArray(splits)
                                ? splits.map((value) => timeFormatter.format(new Date(value * 1000)))
                                : []
                        )
                    },
                    yAxis
                ],
                legend: {
                    show: false
                },
                cursor: {
                    show: true,
                    drag: {
                        x: false,
                        y: false
                    }
                }
            },
            data,
            container
        );
    } catch (err) {
        console.error("[metrics] failed to render chart: %O", err);
        return null;
    }
}

/**
 * Syncs chart width with its container after layout changes.
 *
 * @param plot uPlot instance
 * @param container Chart mount element
 * @returns Nothing.
 */
export function syncMetricsPlotSize(plot: uPlot | null, container: HTMLElement | null): void {
    if (!plot || !container) {
        return;
    }

    const width = Math.max(container.clientWidth, 280);

    if (width > 0) {
        plot.setSize({ width, height: 220 });
    }
}

/**
 * Builds the default percentage formatter for chart axes.
 *
 * @returns Percent formatter
 */
export function percentChartFormatter(): (value: number) => string {
    return formatPercentAxisValue;
}
