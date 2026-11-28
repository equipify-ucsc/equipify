<?php
declare(strict_types=1);

/** Runs a configured XAMPP sendmail profile without a shell or diagnostic logging. */
final class SendmailTransport
{
    public static function send(string $executable, string $message): bool
    {
        $process = null;
        $input = null;
        try {
            $executable = realpath($executable) ?: '';
            if ($executable === '' || !is_file($executable) || !function_exists('proc_open')) return false;
            $directory = dirname($executable);
            if (!is_file($directory . '/sendmail.ini')) return false;
            // The profile directory is ACL-protected by configure_sendmail.ps1.
            // File-backed stdin avoids a blocking pipe write before the timeout.
            $input = $directory . '/message-' . bin2hex(random_bytes(16)) . '.tmp';
            $oldMask = umask(0077);
            try {
                $file = @fopen($input, 'xb');
                if ($file === false) return false;
                try {
                    $offset = 0;
                    while ($offset < strlen($message)) {
                        $written = fwrite($file, substr($message, $offset));
                        if ($written === false || $written === 0) return false;
                        $offset += $written;
                    }
                } finally { fclose($file); }
            } finally { umask($oldMask); }
            $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
            $process = @proc_open([$executable, '-t'],
                [0 => ['file', $input, 'r'], 1 => ['file', $null, 'w'], 2 => ['file', $null, 'w']],
                $pipes, $directory, null, ['bypass_shell' => true, 'suppress_errors' => true]);
            if (!is_resource($process)) return false;
            $timeout = filter_var(getenv('EQUIPIFY_MAIL_TIMEOUT') ?: '15', FILTER_VALIDATE_INT,
                ['options' => ['min_range' => 1, 'max_range' => 60]]);
            if ($timeout === false) $timeout = 15;
            $deadline = microtime(true) + $timeout;
            do {
                $status = proc_get_status($process);
                if (!$status['running']) {
                    $exit = $status['exitcode'];
                    $closed = proc_close($process);
                    $process = null;
                    return ($exit >= 0 ? $exit : $closed) === 0;
                }
                usleep(20000);
            } while (microtime(true) < $deadline);
            @proc_terminate($process);
            return false;
        } catch (Throwable $e) {
            // Never return/log native SMTP diagnostics, addresses, credentials or body.
            return false;
        } finally {
            if (is_resource($process)) { @proc_terminate($process); @proc_close($process); }
            if ($input !== null && is_file($input)) @unlink($input);
        }
    }
}
