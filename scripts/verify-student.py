#!/usr/bin/env python3
"""Compatibility entry point for current broadcast/student browser checks."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name("verify-broadcast.py")), run_name="__main__")
