from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from api.models import AdminAuditLogs, AdminRoles, AdminUsers


ADMIN_TOKEN_SALT = "api.admin.auth"
DEFAULT_ROLE_DEFINITIONS = [
    {
        "name": "Super Admin",
        "code": "super_admin",
        "permissions": ["*"],
    },
    {
        "name": "Operations Admin",
        "code": "ops_admin",
        "permissions": [
            "dashboard.read",
            "bookings.read",
            "bookings.cancel",
            "bookings.refund",
            "flights.read",
            "hotels.read",
            "cars.read",
        ],
    },
    {
        "name": "Inventory Admin",
        "code": "inventory_admin",
        "permissions": [
            "dashboard.read",
            "flights.read",
            "flights.write",
            "flights.delete",
            "hotels.read",
            "hotels.write",
            "hotels.delete",
            "cars.read",
            "cars.write",
            "cars.delete",
            "bookings.read",
        ],
    },
]


def get_client_ip(request):
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def get_user_agent(request):
    return request.headers.get("User-Agent", "")


def serialize_admin_user(admin_user):
    role = admin_user.role
    return {
        "admin_user_id": admin_user.admin_user_id,
        "email": admin_user.email,
        "full_name": admin_user.full_name,
        "role_name": role.name if role else None,
        "role_code": role.code if role else None,
    }


def serialize_role(role):
    return {
        "role_id": role.role_id,
        "name": role.name,
        "code": role.code,
        "permissions": role.permissions or [],
    }


def serialize_admin_management_user(admin_user):
    role = admin_user.role
    return {
        "admin_user_id": admin_user.admin_user_id,
        "email": admin_user.email,
        "full_name": admin_user.full_name,
        "is_active": admin_user.is_active,
        "failed_login_attempts": admin_user.failed_login_attempts,
        "locked_until": admin_user.locked_until.isoformat() if admin_user.locked_until else None,
        "last_login_at": admin_user.last_login_at.isoformat() if admin_user.last_login_at else None,
        "created_at": admin_user.created_at.isoformat() if admin_user.created_at else None,
        "updated_at": admin_user.updated_at.isoformat() if admin_user.updated_at else None,
        "role": {
            "role_id": role.role_id,
            "name": role.name,
            "code": role.code,
            "permissions": role.permissions or [],
        } if role else None,
    }


def issue_admin_token(admin_user):
    payload = {
        "admin_user_id": admin_user.admin_user_id,
        "role_code": admin_user.role.code if admin_user.role else None,
    }
    return signing.TimestampSigner(salt=ADMIN_TOKEN_SALT).sign_object(payload)


def ensure_default_admin_setup():
    for definition in DEFAULT_ROLE_DEFINITIONS:
        AdminRoles.objects.update_or_create(
            code=definition["code"],
            defaults={
                "name": definition["name"],
                "permissions": definition["permissions"],
            },
        )

    default_role = AdminRoles.objects.get(code="super_admin")
    admin_user, created = AdminUsers.objects.get_or_create(
        email=settings.ADMIN_EMAIL,
        defaults={
            "full_name": settings.ADMIN_NAME,
            "role": default_role,
            "password_hash": make_password(settings.ADMIN_PASSWORD),
            "is_active": True,
        },
    )
    if created:
        log_admin_event(
            action="bootstrap_admin_user",
            resource_type="admin_user",
            resource_id=str(admin_user.admin_user_id),
            admin_user=admin_user,
            status="success",
            details={"email": admin_user.email},
        )


def log_admin_event(
    action,
    resource_type,
    resource_id=None,
    admin_user=None,
    role=None,
    status="success",
    details=None,
    request=None,
):
    resolved_role = role or (admin_user.role if admin_user else None)
    AdminAuditLogs.objects.create(
        admin_user=admin_user,
        role=resolved_role,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        status=status,
        details=details or {},
        ip_address=get_client_ip(request) if request else None,
        user_agent=get_user_agent(request) if request else None,
    )


def verify_admin_token(token):
    max_age = max(int(settings.ADMIN_TOKEN_TTL_SECONDS), 1)
    payload = signing.TimestampSigner(salt=ADMIN_TOKEN_SALT).unsign_object(token, max_age=max_age)
    admin_user = (
        AdminUsers.objects.select_related("role")
        .filter(admin_user_id=payload.get("admin_user_id"), is_active=True)
        .first()
    )
    if admin_user is None:
        raise signing.BadSignature("Admin user not found.")
    return admin_user


def extract_bearer_token(request):
    authorization_header = request.headers.get("Authorization", "")
    prefix = "Bearer "
    if authorization_header.startswith(prefix):
        return authorization_header[len(prefix):].strip()
    return ""


def has_permission(admin_user, permission):
    permissions = admin_user.role.permissions if admin_user.role else []
    return "*" in permissions or permission in permissions


def require_admin(request, permission=None):
    token = extract_bearer_token(request)
    if not token:
        return None, Response({"message": "Admin authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        admin_user = verify_admin_token(token)
    except signing.SignatureExpired:
        return None, Response({"message": "Admin session expired."}, status=status.HTTP_401_UNAUTHORIZED)
    except signing.BadSignature:
        return None, Response({"message": "Invalid or expired admin token."}, status=status.HTTP_401_UNAUTHORIZED)

    if admin_user.locked_until and admin_user.locked_until > timezone.now():
        return None, Response({"message": "Admin account is temporarily locked."}, status=status.HTTP_423_LOCKED)

    if permission and not has_permission(admin_user, permission):
        log_admin_event(
            action="permission_denied",
            resource_type="permission",
            resource_id=permission,
            admin_user=admin_user,
            status="denied",
            details={"permission": permission},
            request=request,
        )
        return None, Response({"message": "Insufficient permissions for this action."}, status=status.HTTP_403_FORBIDDEN)

    return admin_user, None


@transaction.atomic
def authenticate_admin(email, password, request=None):
    normalized_email = (email or "").strip().lower()
    admin_user = AdminUsers.objects.select_related("role").filter(email=normalized_email).first()
    if admin_user is None:
        log_admin_event(
            action="login_failed",
            resource_type="admin_session",
            resource_id=normalized_email,
            status="failed",
            details={"reason": "unknown_email"},
            request=request,
        )
        return None, "Invalid admin credentials."

    if not admin_user.is_active:
        log_admin_event(
            action="login_failed",
            resource_type="admin_session",
            resource_id=str(admin_user.admin_user_id),
            admin_user=admin_user,
            status="failed",
            details={"reason": "inactive_account"},
            request=request,
        )
        return None, "Admin account is inactive."

    if admin_user.locked_until and admin_user.locked_until > timezone.now():
        return None, "Admin account is temporarily locked."

    if not check_password(password or "", admin_user.password_hash):
        admin_user.failed_login_attempts = (admin_user.failed_login_attempts or 0) + 1
        if admin_user.failed_login_attempts >= settings.ADMIN_MAX_FAILED_ATTEMPTS:
            admin_user.locked_until = timezone.now() + timedelta(minutes=settings.ADMIN_LOCKOUT_MINUTES)
        admin_user.save(update_fields=["failed_login_attempts", "locked_until", "updated_at"])
        log_admin_event(
            action="login_failed",
            resource_type="admin_session",
            resource_id=str(admin_user.admin_user_id),
            admin_user=admin_user,
            status="failed",
            details={"reason": "bad_password", "failed_login_attempts": admin_user.failed_login_attempts},
            request=request,
        )
        return None, "Invalid admin credentials."

    admin_user.failed_login_attempts = 0
    admin_user.locked_until = None
    admin_user.last_login_at = timezone.now()
    admin_user.save(update_fields=["failed_login_attempts", "locked_until", "last_login_at", "updated_at"])
    log_admin_event(
        action="login_success",
        resource_type="admin_session",
        resource_id=str(admin_user.admin_user_id),
        admin_user=admin_user,
        request=request,
    )
    return admin_user, None
