"""Role-based + permission-based access control.

Roles map to permission sets. Endpoints declare the permission they need
(``require_permission``); record-level checks (e.g. "may this guardian see
this student?") live in :mod:`app.services.access`.
"""

from __future__ import annotations

from enum import StrEnum


class Role(StrEnum):
    STUDENT = "student"
    GUARDIAN = "guardian"
    TEACHER = "teacher"
    MENTOR = "mentor"
    INSTITUTION_ADMIN = "institution_admin"
    PLATFORM_ADMIN = "platform_admin"
    SUPER_ADMIN = "super_admin"


class P(StrEnum):
    # self-service
    PROFILE_READ_SELF = "profile:read_self"
    PROFILE_UPDATE_SELF = "profile:update_self"
    # student learning
    INTERESTS_MANAGE_SELF = "interests:manage_self"
    ACTIVITIES_VIEW = "activities:view"
    ACTIVITIES_SUBMIT = "activities:submit"
    ASSESSMENTS_TAKE = "assessments:take"
    PORTFOLIO_MANAGE_SELF = "portfolio:manage_self"
    ROADMAP_MANAGE_SELF = "roadmap:manage_self"
    AI_USE = "ai:use"
    RECOMMENDATIONS_RESPOND = "recommendations:respond"
    # guardians
    CHILDREN_VIEW = "children:view"
    CONSENT_MANAGE = "consent:manage"
    # mentors / teachers
    STUDENTS_VIEW_ASSIGNED = "students:view_assigned"
    ACTIVITIES_MANAGE = "activities:manage"
    ACTIVITIES_ASSIGN = "activities:assign"
    ASSESSMENTS_MANAGE = "assessments:manage"
    SUBMISSIONS_EVALUATE = "submissions:evaluate"
    FEEDBACK_WRITE = "feedback:write"
    RECOMMENDATIONS_REVIEW = "recommendations:review"
    BATCHES_MANAGE = "batches:manage"
    MESSAGES_SEND = "messages:send"
    REPORTS_VIEW = "reports:view"
    # institution
    INSTITUTION_MANAGE = "institution:manage"
    INSTITUTION_USERS_MANAGE = "institution:users_manage"
    INSTITUTION_ANALYTICS = "institution:analytics"
    # platform
    USERS_MANAGE = "users:manage"
    DOMAINS_MANAGE = "domains:manage"
    INSTITUTIONS_MANAGE = "institutions:manage"
    CONTENT_MANAGE = "content:manage"
    NOTIFICATIONS_BROADCAST = "notifications:broadcast"
    # super admin
    TENANTS_MANAGE = "tenants:manage"
    SUBSCRIPTIONS_MANAGE = "subscriptions:manage"
    FEATURE_FLAGS_MANAGE = "feature_flags:manage"
    AI_SETTINGS_MANAGE = "ai_settings:manage"
    SCORING_MANAGE = "scoring:manage"
    SYSTEM_MONITOR = "system:monitor"
    AUDIT_VIEW = "audit:view"


_STUDENT = {
    P.PROFILE_READ_SELF, P.PROFILE_UPDATE_SELF, P.INTERESTS_MANAGE_SELF, P.ACTIVITIES_VIEW,
    P.ACTIVITIES_SUBMIT, P.ASSESSMENTS_TAKE, P.PORTFOLIO_MANAGE_SELF, P.ROADMAP_MANAGE_SELF,
    P.AI_USE, P.RECOMMENDATIONS_RESPOND,
}
_GUARDIAN = {P.PROFILE_READ_SELF, P.PROFILE_UPDATE_SELF, P.CHILDREN_VIEW, P.CONSENT_MANAGE,
             P.MESSAGES_SEND, P.REPORTS_VIEW, P.ACTIVITIES_VIEW, P.AI_USE}
_MENTOR = {
    P.PROFILE_READ_SELF, P.PROFILE_UPDATE_SELF, P.STUDENTS_VIEW_ASSIGNED, P.ACTIVITIES_VIEW,
    P.ACTIVITIES_MANAGE, P.ACTIVITIES_ASSIGN, P.ASSESSMENTS_MANAGE, P.SUBMISSIONS_EVALUATE,
    P.FEEDBACK_WRITE, P.RECOMMENDATIONS_REVIEW, P.BATCHES_MANAGE, P.MESSAGES_SEND, P.REPORTS_VIEW, P.AI_USE,
}
_TEACHER = set(_MENTOR)
_INSTITUTION_ADMIN = _MENTOR | {P.INSTITUTION_MANAGE, P.INSTITUTION_USERS_MANAGE, P.INSTITUTION_ANALYTICS}
_PLATFORM_ADMIN = _INSTITUTION_ADMIN | {
    P.USERS_MANAGE, P.DOMAINS_MANAGE, P.INSTITUTIONS_MANAGE, P.CONTENT_MANAGE, P.NOTIFICATIONS_BROADCAST,
}
_SUPER_ADMIN = _PLATFORM_ADMIN | {
    P.TENANTS_MANAGE, P.SUBSCRIPTIONS_MANAGE, P.FEATURE_FLAGS_MANAGE, P.AI_SETTINGS_MANAGE,
    P.SCORING_MANAGE, P.SYSTEM_MONITOR, P.AUDIT_VIEW,
}

ROLE_PERMISSIONS: dict[Role, frozenset[P]] = {
    Role.STUDENT: frozenset(_STUDENT),
    Role.GUARDIAN: frozenset(_GUARDIAN),
    Role.MENTOR: frozenset(_MENTOR),
    Role.TEACHER: frozenset(_TEACHER),
    Role.INSTITUTION_ADMIN: frozenset(_INSTITUTION_ADMIN),
    Role.PLATFORM_ADMIN: frozenset(_PLATFORM_ADMIN),
    Role.SUPER_ADMIN: frozenset(_SUPER_ADMIN),
}

STAFF_ROLES = {Role.MENTOR, Role.TEACHER, Role.INSTITUTION_ADMIN, Role.PLATFORM_ADMIN, Role.SUPER_ADMIN}
GLOBAL_ROLES = {Role.PLATFORM_ADMIN, Role.SUPER_ADMIN}
SELF_REGISTER_ROLES = {Role.STUDENT, Role.GUARDIAN}


def has_permission(role: str, perm: P) -> bool:
    try:
        return perm in ROLE_PERMISSIONS[Role(role)]
    except ValueError:
        return False


def permissions_for(role: str) -> list[str]:
    try:
        return sorted(p.value for p in ROLE_PERMISSIONS[Role(role)])
    except ValueError:
        return []
