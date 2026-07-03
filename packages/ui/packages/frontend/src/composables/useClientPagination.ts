import { computed, ref, type Ref } from "vue";

/**
 * Client-side pagination state for in-memory lists.
 *
 * @param items Ref to the full item list
 * @param pageSize Number of items per page
 * @returns Pagination controls and the current page slice
 */
export function useClientPagination<T>(items: Ref<T[]>, pageSize = 20) {
    const page = ref(0);

    const totalPages = computed(() => {
        const count = Math.ceil(items.value.length / pageSize);
        return count > 0 ? count : 1;
    });

    const paginatedItems = computed(() => {
        const start = page.value * pageSize;
        return items.value.slice(start, start + pageSize);
    });

    const pageLabel = computed(() => `${page.value + 1} / ${totalPages.value}`);

    const canGoPrevious = computed(() => page.value > 0);

    const canGoNext = computed(() => page.value < totalPages.value - 1);

    /**
     * Moves to the previous page when available.
     *
     * @returns Nothing.
     */
    function previousPage(): void {
        if (page.value > 0) {
            page.value -= 1;
        }
    }

    /**
     * Moves to the next page when available.
     *
     * @returns Nothing.
     */
    function nextPage(): void {
        if (page.value < totalPages.value - 1) {
            page.value += 1;
        }
    }

    /**
     * Resets pagination to the first page.
     *
     * @returns Nothing.
     */
    function resetPage(): void {
        page.value = 0;
    }

    return {
        page,
        totalPages,
        paginatedItems,
        pageLabel,
        canGoPrevious,
        canGoNext,
        previousPage,
        nextPage,
        resetPage
    };
}
