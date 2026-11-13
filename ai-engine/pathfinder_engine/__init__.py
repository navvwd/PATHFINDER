"""PathFinder AI engine.

Pure, framework-independent business logic for:

* ``scoring``            - multidimensional, configurable, explainable domain scoring
* ``analytics``          - safe progress / trend / consistency calculations
* ``recommendation``     - explainable, evidence-gated recommendations
* ``report_generation``  - deterministic, record-grounded report text

The engine never touches the database. The backend converts ORM rows into the
plain dataclasses defined in :mod:`pathfinder_engine.types` and persists results.
This keeps one source of truth for business rules that every client
(web, mobile, reports, AI grounding) relies on.
"""

from .types import (  # noqa: F401
    DimensionResult,
    DomainEvidence,
    DomainScoreResult,
    EvidenceRecord,
    InterestSignal,
)

__version__ = "0.1.0"
