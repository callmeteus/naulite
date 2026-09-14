/**
 * Warpgate SSH target formatting (OpenSSH user@host with embedded target name).
 */
export namespace WarpgateSshTarget {
    export interface Options {
        username: string;
        host: string;
        port: number;
        targetName: string;
    }

    /**
     * Builds the SSH user@host segment for Warpgate (`ubuntu:vm.prod@warpgate.arpa`).
     *
     * @param options Connection options
     * @returns SSH target string without scheme
     */
    export function formatUserHost(options: Options): string {
        return `${options.username}:${options.targetName}@${options.host}`;
    }

    /**
     * Builds a full ssh command prefix with port.
     *
     * @param options Connection options
     * @returns argv prefix for OpenSSH
     */
    export function buildSshArgv(options: Options): string[] {
        return [
            "ssh",
            "-p",
            String(options.port),
            formatUserHost(options)
        ];
    }
}
