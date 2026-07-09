import { computed, ref, type Ref } from "vue";
import type { PaginatedResponse } from "@naulite/sdk";

/**
 * Server-side pagination state backed by paginated API responses.
 *
 * @param fetchPage Function that loads a page from the API
 * @param pageSize Default page size
 * @returns Pagination controls and the current page items
 */
export function useServerPagination<T>(
    fetchPage: (page: number, limit: number) => Promise<PaginatedResponse<T>>,
    pageSize = 20
) {
    const page = ref(1);
    const items = ref<T[]>([]) as Ref<T[]>;
    const total = ref(0);
    const hasMore = ref(false);
    const loading = ref(false);
    const error = ref("");

    const totalPages = computed(() => {
        const count = Math.ceil(total.value / pageSize);
        return count > 0 ? count : 1;
    });

    const pageLabel = computed(() => `${page.value} / ${totalPages.value}`);

    const canGoPrevious = computed(() => page.value > 1);

    const canGoNext = computed(() => hasMore.value || page.value < totalPages.value);

    /**
     * Reloads the current page from the API.
     *
     * @returns Nothing.
     */
    async function refresh(): Promise<void> {
        loading.value = true;
        error.value = "";

        try {
            const response = await fetchPage(page.value, pageSize);
            items.value = response.items;
            total.value = response.total;
            hasMore.value = response.hasMore;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
        } finally {
            loading.value = false;
        }
    }

    /**
     * Moves to the previous page when available.
     *
     * @returns Nothing.
     */
    async function previousPage(): Promise<void> {
        if (page.value > 1) {
            page.value -= 1;
            await refresh();
        }
    }

    /**
     * Moves to the next page when available.
     *
     * @returns Nothing.
     */
    async function nextPage(): Promise<void> {
        if (canGoNext.value) {
            page.value += 1;
            await refresh();
        }
    }

    /**
     * Resets pagination to the first page and reloads.
     *
     * @returns Nothing.
     */
    async function resetPage(): Promise<void> {
        page.value = 1;
        await refresh();
    }

    return {
        page,
        items,
        total,
        hasMore,
        loading,
        error,
        pageLabel,
        canGoPrevious,
        canGoNext,
        previousPage,
        nextPage,
        resetPage,
        refresh
    };
}
