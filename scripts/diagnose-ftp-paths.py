"""FTP scope/path diagnostic for diagnose-ftp-paths.yml — standalone
script (not an inline workflow heredoc) so YAML block-scalar indentation
can't break it, per this repo's established pattern."""
import os
import ftplib
import ssl

host = os.environ["FTP_HOST"]
username = os.environ["FTP_USERNAME"]
password = os.environ["FTP_PASSWORD"]
learn_dir = os.environ.get("FTP_LEARN_REMOTE_DIR", "")
main_dir = os.environ.get("FTP_REMOTE_DIR", "")

print(f"FTP_LEARN_REMOTE_DIR secret value: {learn_dir!r}")
print(f"FTP_REMOTE_DIR variable value: {main_dir!r}")
print()

ftp = ftplib.FTP_TLS(host, timeout=30)
ftp.login(username, password)
ftp.prot_p()

print(f"--- Working directory immediately after login ---")
print(ftp.pwd())
print()

print("--- Listing at login root ---")
try:
    ftp.retrlines("LIST")
except Exception as e:
    print(f"LIST failed: {e}")
print()

for candidate in ["public_html", "public_html/learn", "learn", learn_dir.rstrip("/")]:
    if not candidate:
        continue
    print(f"--- Attempting to enter and list: {candidate!r} ---")
    try:
        ftp.cwd("/")  # reset to login root each time
        ftp.cwd(candidate)
        print(f"SUCCESS: now in {ftp.pwd()}")
        ftp.retrlines("LIST")
    except Exception as e:
        print(f"FAILED to enter {candidate!r}: {e}")
    print()

ftp.quit()
