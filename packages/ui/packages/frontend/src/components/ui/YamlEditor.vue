<script setup lang="ts">
import { EditorView, basicSetup } from "codemirror";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { yaml } from "@codemirror/lang-yaml";
import { Compartment, EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";

import { useTheme } from "../../composables/useTheme";

const props = withDefaults(
    defineProps<{
        /**
         * YAML content bound to the editor.
         */
        modelValue: string;

        /**
         * Whether editing is disabled.
         */
        disabled?: boolean;

        /**
         * Minimum editor height CSS value.
         */
        minHeight?: string;
    }>(),
    {
        disabled: false,
        minHeight: "28rem"
    }
);

const emit = defineEmits<{
    "update:modelValue": [value: string];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const { theme } = useTheme();
const themeCompartment = new Compartment();
const editableCompartment = new Compartment();

let view: EditorView | null = null;
let syncingExternalValue = false;

/**
 * Builds CodeMirror extensions for the YAML editor.
 *
 * @param isDark Whether dark theme is active
 * @param editable Whether the editor accepts input
 * @returns Extension list
 */
function buildExtensions(isDark: boolean, editable: boolean) {
    return [
        basicSetup,
        yaml(),
        themeCompartment.of(isDark ? oneDark : []),
        editableCompartment.of(EditorView.editable.of(editable)),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
            if (!update.docChanged || syncingExternalValue) {
                return;
            }

            emit("update:modelValue", update.state.doc.toString());
        }),
        EditorView.theme({
            "&": {
                minHeight: props.minHeight,
                fontSize: "13px"
            },

            ".cm-scroller": {
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            },

            ".cm-content": {
                padding: "12px 0"
            },

            ".cm-gutters": {
                borderRight: "1px solid color-mix(in oklab, currentColor 12%, transparent)"
            }
        })
    ];
}

onMounted(() => {
    if (!containerRef.value) {
        return;
    }

    view = new EditorView({
        parent: containerRef.value,
        state: EditorState.create({
            doc: props.modelValue,
            extensions: buildExtensions(theme.value === "dark", !props.disabled)
        })
    });
});

watch(theme, (value) => {
    view?.dispatch({
        effects: themeCompartment.reconfigure(value === "dark" ? oneDark : [])
    });
});

watch(
    () => props.disabled,
    (value) => {
        view?.dispatch({
            effects: editableCompartment.reconfigure(EditorView.editable.of(!value))
        });
    }
);

watch(
    () => props.modelValue,
    (value) => {
        if (!view || value === view.state.doc.toString()) {
            return;
        }

        syncingExternalValue = true;
        view.dispatch({
            changes: {
                from: 0,
                to: view.state.doc.length,
                insert: value
            }
        });
        syncingExternalValue = false;
    }
);

onBeforeUnmount(() => {
    view?.destroy();
    view = null;
});
</script>

<template>
    <div
        ref="containerRef"
        class="yaml-editor overflow-hidden rounded-lg border border-base-300 bg-base-100"
    />
</template>
