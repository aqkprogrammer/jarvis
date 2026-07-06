"""
Plugin system for JARVIS.
Provides dynamic plugin loading, sandboxing, permission validation,
version checking, and configuration schema validation.
"""

from __future__ import annotations

import importlib
import importlib.util
import inspect
import json
import logging
import os
import sys
import types
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import jsonschema  # type: ignore

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums & metadata
# ---------------------------------------------------------------------------


class PluginPermission(str, Enum):
    FILESYSTEM_READ  = "filesystem:read"
    FILESYSTEM_WRITE = "filesystem:write"
    NETWORK_EXTERNAL = "network:external"
    NETWORK_INTERNAL = "network:internal"
    SUBPROCESS       = "subprocess:execute"
    SANDBOX          = "sandbox:execute"
    DATABASE_READ    = "database:read"
    DATABASE_WRITE   = "database:write"
    SYSTEM           = "system:admin"


@dataclass
class PluginMetadata:
    name: str
    version: str
    description: str
    author: str = ""
    homepage: str = ""
    permissions: list[PluginPermission] = field(default_factory=list)
    min_jarvis_version: str = "1.0.0"
    config_schema: dict = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Abstract base class
# ---------------------------------------------------------------------------


class PluginBase(ABC):
    """
    Abstract base class for all JARVIS plugins.

    Subclass this and implement:
        - metadata (class attribute)
        - setup()
        - teardown()
        - execute(action, **kwargs)
    """

    metadata: PluginMetadata = PluginMetadata(name="unnamed", version="0.0.0", description="")
    _config: dict = {}
    _is_active: bool = False

    @abstractmethod
    async def setup(self, config: dict) -> None:
        """Called once when the plugin is loaded. Perform initialization here."""

    @abstractmethod
    async def teardown(self) -> None:
        """Called when the plugin is unloaded or the system shuts down."""

    @abstractmethod
    async def execute(self, action: str, **kwargs: Any) -> Any:
        """
        Execute a named action provided by this plugin.

        Args:
            action: The action identifier (e.g. "search", "run_code")
            **kwargs: Action-specific parameters

        Returns:
            Action result (plugin-defined)
        """

    def get_actions(self) -> list[str]:
        """Return a list of supported action names."""
        return []

    def get_schema(self, action: str) -> Optional[dict]:
        """Return JSON Schema for a given action's kwargs, or None."""
        return None

    @property
    def is_active(self) -> bool:
        return self._is_active

    def __repr__(self) -> str:
        return f"<Plugin {self.metadata.name}@{self.metadata.version}>"


# ---------------------------------------------------------------------------
# Sandboxed module loader
# ---------------------------------------------------------------------------

_SAFE_BUILTINS = {
    "abs", "all", "any", "ascii", "bin", "bool", "breakpoint", "bytearray",
    "bytes", "callable", "chr", "complex", "dict", "dir", "divmod", "enumerate",
    "filter", "float", "format", "frozenset", "getattr", "globals", "hasattr",
    "hash", "hex", "id", "input", "int", "isinstance", "issubclass", "iter",
    "len", "list", "locals", "map", "max", "memoryview", "min", "next", "object",
    "oct", "ord", "pow", "print", "property", "range", "repr", "reversed",
    "round", "set", "setattr", "slice", "sorted", "staticmethod", "str", "sum",
    "super", "tuple", "type", "vars", "zip", "None", "True", "False",
    "__build_class__", "__import__", "__name__", "__loader__", "__spec__",
}


def _create_restricted_globals(allowed_builtins: Optional[set[str]] = None) -> dict:
    """Create a restricted __builtins__ for sandboxed plugin execution."""
    import builtins

    safe = allowed_builtins or _SAFE_BUILTINS
    return {
        "__builtins__": {k: getattr(builtins, k) for k in safe if hasattr(builtins, k)}
    }


# ---------------------------------------------------------------------------
# PluginManager
# ---------------------------------------------------------------------------


class PluginManager:
    """
    Manages the lifecycle of JARVIS plugins.

    - Discovers plugin modules in the plugins directory
    - Validates permissions and config schemas
    - Provides sandboxed execution
    - Supports hot-reload (unload + reload)
    """

    JARVIS_VERSION = "1.0.0"

    def __init__(
        self,
        plugins_dir: Optional[str | Path] = None,
        allowed_permissions: Optional[set[PluginPermission]] = None,
    ) -> None:
        self.plugins_dir = Path(plugins_dir) if plugins_dir else Path(__file__).parent.parent
        self.allowed_permissions = allowed_permissions or set(PluginPermission)
        self._registry: dict[str, PluginBase] = {}  # name -> instance
        self._modules: dict[str, types.ModuleType] = {}

    # ------------------------------------------------------------------
    # Loading / unloading
    # ------------------------------------------------------------------

    async def load(self, plugin_name: str, config: Optional[dict] = None) -> PluginBase:
        """
        Load a plugin by name.
        Searches plugins_dir for a subdirectory or .py file matching *plugin_name*.
        """
        if plugin_name in self._registry:
            logger.info("Plugin '%s' is already loaded", plugin_name)
            return self._registry[plugin_name]

        module = self._import_plugin_module(plugin_name)
        plugin_class = self._find_plugin_class(module, plugin_name)
        instance = plugin_class()

        self._validate_permissions(instance.metadata)
        self._validate_version(instance.metadata)

        cfg = config or {}
        if instance.metadata.config_schema:
            self._validate_config(cfg, instance.metadata.config_schema)

        instance._config = cfg
        await instance.setup(cfg)
        instance._is_active = True
        self._registry[plugin_name] = instance
        self._modules[plugin_name] = module

        logger.info(
            "Loaded plugin '%s' v%s (permissions=%s)",
            plugin_name,
            instance.metadata.version,
            [p.value for p in instance.metadata.permissions],
        )
        return instance

    async def unload(self, plugin_name: str) -> None:
        """Teardown and remove a plugin from the registry."""
        if plugin_name not in self._registry:
            raise KeyError(f"Plugin '{plugin_name}' is not loaded")

        instance = self._registry[plugin_name]
        try:
            await instance.teardown()
        except Exception as exc:
            logger.warning("Error during teardown of '%s': %s", plugin_name, exc)

        instance._is_active = False
        del self._registry[plugin_name]

        # Remove from sys.modules to allow reload
        mod = self._modules.pop(plugin_name, None)
        if mod and mod.__name__ in sys.modules:
            del sys.modules[mod.__name__]

        logger.info("Unloaded plugin '%s'", plugin_name)

    async def reload(self, plugin_name: str, config: Optional[dict] = None) -> PluginBase:
        """Unload and re-load a plugin (hot-reload)."""
        existing_config = self._registry.get(plugin_name, None)
        cfg = config or (existing_config._config if existing_config else {})
        await self.unload(plugin_name)
        return await self.load(plugin_name, cfg)

    async def load_all(self, configs: Optional[dict[str, dict]] = None) -> list[PluginBase]:
        """Auto-discover and load all plugins in plugins_dir."""
        configs = configs or {}
        loaded = []
        for entry in sorted(self.plugins_dir.iterdir()):
            # Skip non-plugin entries
            if entry.name.startswith("_") or entry.name == "core":
                continue
            if entry.is_dir() and (entry / "__init__.py").exists():
                name = entry.name
            elif entry.suffix == ".py" and not entry.name.startswith("_"):
                name = entry.stem
            else:
                continue
            try:
                plugin = await self.load(name, configs.get(name))
                loaded.append(plugin)
            except Exception as exc:
                logger.error("Failed to load plugin '%s': %s", name, exc)
        return loaded

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    async def call(self, plugin_name: str, action: str, **kwargs: Any) -> Any:
        """Execute an action on a named plugin."""
        if plugin_name not in self._registry:
            raise KeyError(f"Plugin '{plugin_name}' is not loaded")
        plugin = self._registry[plugin_name]
        if not plugin.is_active:
            raise RuntimeError(f"Plugin '{plugin_name}' is not active")

        schema = plugin.get_schema(action)
        if schema:
            self._validate_config(kwargs, schema)

        logger.debug("Calling plugin '%s' action '%s'", plugin_name, action)
        return await plugin.execute(action, **kwargs)

    # ------------------------------------------------------------------
    # Listing
    # ------------------------------------------------------------------

    def list(self) -> list[dict]:
        """Return metadata for all loaded plugins."""
        return [
            {
                "name": p.metadata.name,
                "version": p.metadata.version,
                "description": p.metadata.description,
                "author": p.metadata.author,
                "permissions": [perm.value for perm in p.metadata.permissions],
                "actions": p.get_actions(),
                "is_active": p.is_active,
                "tags": p.metadata.tags,
            }
            for p in self._registry.values()
        ]

    def get(self, plugin_name: str) -> Optional[PluginBase]:
        return self._registry.get(plugin_name)

    def is_loaded(self, plugin_name: str) -> bool:
        return plugin_name in self._registry

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _import_plugin_module(self, plugin_name: str) -> types.ModuleType:
        # Try package first (plugins/<name>/__init__.py)
        pkg_path = self.plugins_dir / plugin_name / "__init__.py"
        mod_path = self.plugins_dir / f"{plugin_name}.py"

        if pkg_path.exists():
            spec = importlib.util.spec_from_file_location(
                f"jarvis_plugins.{plugin_name}", str(pkg_path),
                submodule_search_locations=[str(self.plugins_dir / plugin_name)],
            )
        elif mod_path.exists():
            spec = importlib.util.spec_from_file_location(
                f"jarvis_plugins.{plugin_name}", str(mod_path)
            )
        else:
            raise FileNotFoundError(
                f"Plugin '{plugin_name}' not found in {self.plugins_dir}"
            )

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def _find_plugin_class(self, module: types.ModuleType, plugin_name: str) -> type[PluginBase]:
        for _, obj in inspect.getmembers(module, inspect.isclass):
            if issubclass(obj, PluginBase) and obj is not PluginBase:
                return obj
        raise ImportError(
            f"No PluginBase subclass found in plugin '{plugin_name}'"
        )

    def _validate_permissions(self, metadata: PluginMetadata) -> None:
        for perm in metadata.permissions:
            if perm not in self.allowed_permissions:
                raise PermissionError(
                    f"Plugin '{metadata.name}' requires permission '{perm.value}' "
                    f"which is not allowed by this PluginManager"
                )

    def _validate_version(self, metadata: PluginMetadata) -> None:
        def _parse(v: str) -> tuple:
            return tuple(int(x) for x in v.split(".")[:3])

        required = _parse(metadata.min_jarvis_version)
        current = _parse(self.JARVIS_VERSION)
        if current < required:
            raise RuntimeError(
                f"Plugin '{metadata.name}' requires JARVIS >= {metadata.min_jarvis_version} "
                f"(current: {self.JARVIS_VERSION})"
            )

    @staticmethod
    def _validate_config(config: dict, schema: dict) -> None:
        try:
            jsonschema.validate(instance=config, schema=schema)
        except jsonschema.ValidationError as exc:
            raise ValueError(f"Plugin config validation failed: {exc.message}") from exc
