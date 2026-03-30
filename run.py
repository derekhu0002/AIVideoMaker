import os

from app.server import run_server
from app.storage import ensure_data_dirs


if __name__ == "__main__":
    ensure_data_dirs()
    host = os.environ.get("APP_HOST", "127.0.0.1")
    port = int(os.environ.get("APP_PORT", "8005"))
    run_server(host=host, port=port)
