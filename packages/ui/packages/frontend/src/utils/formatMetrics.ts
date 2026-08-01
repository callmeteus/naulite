import type { PromQLSample } from "@naulite/sdk";

/**
 * Sums numeric values from an instant PromQL vector.
 *
 * @param samples Instant query samples
 * @returns Total value or null when empty
 */
export function sumPromqlSamples(samples: PromQLSample[] | undefined): number | null {
    if (!samples || samples.length === 0) {
        return null;
    }

    return samples.reduce((total, sample) => total + Number(sample.value[1]), 0);
}

/**
 * Reads a single instant sample, optionally filtered by node id.
 *
 * @param samples Instant query samples
 * @param nodeId Optional node id label
 * @returns Sample value or null
 */
export function pickPromqlSampleValue(samples: PromQLSample[] | undefined, nodeId?: string): number | null {
    if (!samples || samples.length === 0) {
        return null;
    }

    if (nodeId) {
        const match = samples.find((sample) => sample.metric.node_id === nodeId);

        if (match) {
            return Number(match.value[1]);
        }
    }

    return Number(samples[0].value[1]);
}

/**
 * Returns the last value from a plotted time series.
 *
 * @param data uPlot data tuple
 * @returns Latest Y value or null
 */
export function latestSeriesValue(data: [number[], number[]]): number | null {
    if (data[1].length === 0) {
        return null;
    }

    return data[1][data[1].length - 1] ?? null;
}

/**
 * Formats millicores as a core count.
 *
 * @param millicores CPU capacity or usage in millicores
 * @returns Human-readable core label
 */
export function formatCpuCores(millicores: number): string {
    const cores = millicores / 1000;

    if (cores >= 10) {
        return cores.toFixed(0);
    }

    if (cores >= 1) {
        return cores.toFixed(1);
    }

    return cores.toFixed(2);
}

/**
 * Formats CPU usage against total schedulable capacity.
 *
 * @param usedMillis Used millicores
 * @param totalMillis Total millicores
 * @returns Summary such as "68% · 6.8 / 10 cores"
 */
export function formatCpuUsageSummary(usedMillis: number | null, totalMillis: number | null): string {
    if (usedMillis === null || totalMillis === null || totalMillis <= 0) {
        return "-";
    }

    const percent = Math.round((usedMillis / totalMillis) * 100);

    return `${percent}% · ${formatCpuCores(usedMillis)} / ${formatCpuCores(totalMillis)} cores`;
}

/**
 * Formats megabytes as MB or GB.
 *
 * @param amountMb Memory amount in megabytes
 * @returns Human-readable memory label
 */
export function formatMemoryMb(amountMb: number): string {
    if (amountMb >= 1024) {
        return `${(amountMb / 1024).toFixed(1)} GB`;
    }

    return `${Math.round(amountMb)} MB`;
}

/**
 * Formats memory usage against total host capacity.
 *
 * @param usedMb Used megabytes
 * @param totalMb Total megabytes
 * @returns Summary such as "3.2 GB / 16 GB (20%)"
 */
export function formatMemoryUsageSummary(usedMb: number | null, totalMb: number | null): string {
    if (usedMb === null || totalMb === null || totalMb <= 0) {
        return "-";
    }

    const percent = Math.round((usedMb / totalMb) * 100);

    return `${formatMemoryMb(usedMb)} / ${formatMemoryMb(totalMb)} (${percent}%)`;
}

/**
 * Formats an instance CPU percentage sample.
 *
 * @param raw Raw metric value
 * @returns Percentage label
 */
export function formatInstanceCpuPercent(raw: string): string {
    const value = Number(raw);

    if (!Number.isFinite(value)) {
        return "-";
    }

    return `${value.toFixed(1)}%`;
}

/**
 * Formats an instance memory sample in bytes.
 *
 * @param raw Raw metric value in bytes
 * @returns Human-readable memory label
 */
export function formatInstanceMemoryBytes(raw: string): string {
    const bytes = Number(raw);

    if (!Number.isFinite(bytes)) {
        return "-";
    }

    const megabytes = bytes / (1024 * 1024);

    if (megabytes >= 1024) {
        return `${(megabytes / 1024).toFixed(2)} GB`;
    }

    if (megabytes >= 1) {
        return `${megabytes.toFixed(0)} MB`;
    }

    return `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * Converts a usage series into percentage of a fixed capacity.
 *
 * @param data uPlot data tuple
 * @param total Capacity total for the same unit
 * @returns Percentage series capped at 100
 */
export function toPercentPlotData(data: [number[], number[]], total: number): [number[], number[]] {
    if (total <= 0) {
        return data;
    }

    return [
        data[0],
        data[1].map((value) => Math.min(100, (value / total) * 100))
    ];
}

/**
 * Formats a chart percentage axis value.
 *
 * @param value Axis value
 * @returns Percent label
 */
export function formatPercentAxisValue(value: number): string {
    return `${value.toFixed(0)}%`;
}
