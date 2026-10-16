"""Root conftest.py — pytest path configuration for kong-gateway tests.

Adds the apps/kong-gateway directory to sys.path so that
  from src.plugins.session_identity import ...
  from src.plugins.dynamic_router import ...
  from src.plugins.shared import ...
all resolve correctly in both unit and integration tests.
"""

import sys
from pathlib import Path

# Ensure the kong-gateway root is on the path so `src` is importable.
ROOT = Path(__file__).parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Also add src/plugins so that flat plugin files can resolve `from shared import ...`
# (mirrors PYTHONPATH=/opt/kong/plugins set in the Docker container).
PLUGINS_DIR = ROOT / "src" / "plugins"
if str(PLUGINS_DIR) not in sys.path:
    sys.path.insert(0, str(PLUGINS_DIR))

# Import shared modules via their full path FIRST, then alias them as `shared.*`
# so that plugin files doing `from shared.db import ...` get the same module object
# as tests doing `from src.plugins.shared.db import ...` (avoids double-import trap).
import src.plugins.shared  # noqa: E402
import src.plugins.shared.audit  # noqa: E402
import src.plugins.shared.db  # noqa: E402
import src.plugins.shared.deletion_handler  # noqa: E402
import src.plugins.shared.iam  # noqa: E402
import src.plugins.shared.purge  # noqa: E402
import src.plugins.shared.session_store  # noqa: E402

sys.modules.setdefault("shared", src.plugins.shared)
sys.modules.setdefault("shared.db", src.plugins.shared.db)
sys.modules.setdefault("shared.iam", src.plugins.shared.iam)
sys.modules.setdefault("shared.session_store", src.plugins.shared.session_store)
sys.modules.setdefault("shared.audit", src.plugins.shared.audit)
sys.modules.setdefault("shared.purge", src.plugins.shared.purge)
sys.modules.setdefault("shared.deletion_handler", src.plugins.shared.deletion_handler)

# Now import plugin modules — their `from shared import ...` will resolve to the
# aliased modules above, so isinstance() checks in tests work correctly.
import src.plugins.dynamic_router  # noqa: E402
import src.plugins.session_identity  # noqa: E402
