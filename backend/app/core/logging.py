import asyncio
import logging
import os
import sys
import time
from collections.abc import Callable
from functools import wraps

# ── ANSI colours ──────────────────────────────────────────────────────────────
RESET = "\033[0m"
COLOURS = {
    "DEBUG":    "\033[36m",   # cyan
    "INFO":     "\033[32m",   # green
    "WARNING":  "\033[33m",   # yellow
    "ERROR":    "\033[31m",   # red
    "CRITICAL": "\033[35m",   # magenta
}


class ColourFormatter(logging.Formatter):
    FMT = "%(asctime)s  %(levelname)-8s  %(name)s  |  %(message)s"

    def __init__(self, datefmt: str | None = None) -> None:
        super().__init__(fmt=self.FMT, datefmt=datefmt)

    def format(self, record: logging.LogRecord) -> str:
        colour = COLOURS.get(record.levelname, RESET)
        record.levelname = f"{colour}{record.levelname}{RESET}"
        return super().format(record)


def setup_logging() -> None:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(ColourFormatter(datefmt="%Y-%m-%d %H:%M:%S"))
    logging.basicConfig(level=level, handlers=[handler], force=True)
    # silence noisy third-party loggers
    for noisy in ("httpx", "httpcore", "openai", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


# ── Decorator: logs entry, exit, duration and any exception ───────────────────
def log_call(logger: logging.Logger) -> Callable:
    """Decorator that logs function entry/exit with elapsed time."""
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        async def async_wrapper(*args, **kwargs):
            logger.info("→ %s  called", fn.__name__)
            t0 = time.perf_counter()
            try:
                result = await fn(*args, **kwargs)
                elapsed = (time.perf_counter() - t0) * 1000
                logger.info("← %s  OK  (%.1f ms)", fn.__name__, elapsed)
                return result
            except Exception as exc:
                elapsed = (time.perf_counter() - t0) * 1000
                logger.error("✗ %s  FAILED  (%.1f ms)  %s: %s",
                             fn.__name__, elapsed, type(exc).__name__, exc)
                raise

        @wraps(fn)
        def sync_wrapper(*args, **kwargs):
            logger.info("→ %s  called", fn.__name__)
            t0 = time.perf_counter()
            try:
                result = fn(*args, **kwargs)
                elapsed = (time.perf_counter() - t0) * 1000
                logger.info("← %s  OK  (%.1f ms)", fn.__name__, elapsed)
                return result
            except Exception as exc:
                elapsed = (time.perf_counter() - t0) * 1000
                logger.error("✗ %s  FAILED  (%.1f ms)  %s: %s",
                             fn.__name__, elapsed, type(exc).__name__, exc)
                raise

        return async_wrapper if asyncio.iscoroutinefunction(fn) else sync_wrapper
    return decorator
