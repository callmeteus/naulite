#!/usr/bin/env bash

# Resolves the LuckyMaker Naulite lab directory (private luckymaker repo).

# Prints absolute path to luckymaker/.naulite/lab on stdout.
naulite_lm_lab_dir() {
    if [ -n "${NAULITE_LM_LAB_DIR:-}" ]; then
        echo "${NAULITE_LM_LAB_DIR}"
        return 0
    fi

    local lib_dir
    lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local workspace_root
    workspace_root="$(cd "${lib_dir}/../../../../.." && pwd)"
    local lm_paths="${workspace_root}/luckymaker/.naulite/lab/lib/lm-lab-paths.sh"

    if [ -f "${lm_paths}" ]; then
        # shellcheck source=../../../../../../luckymaker/.naulite/lab/lib/lm-lab-paths.sh
        source "${lm_paths}"
        lm_lab_dir
        return 0
    fi

    echo "${workspace_root}/luckymaker/.naulite/lab"
}
