import json

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST


username_validator = UnicodeUsernameValidator()


def _json_body(request):
    try:
        data = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError("Invalid JSON body.")
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object.")
    return data


def _credentials(request):
    try:
        data = _json_body(request)
    except ValueError as exc:
        return None, None, JsonResponse({"error": str(exc)}, status=400)

    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    return username, password, None


@require_POST
def register_view(request):
    username, password, error = _credentials(request)
    if error:
        return error

    if not 3 <= len(username) <= 150:
        return JsonResponse({"error": "Username must be 3 to 150 characters."}, status=400)
    try:
        username_validator(username)
    except ValidationError:
        return JsonResponse(
            {"error": "Username may contain letters, numbers, and @/./+/-/_ only."},
            status=400,
        )
    if len(password) < 6:
        return JsonResponse({"error": "Password must be at least 6 characters."}, status=400)
    if User.objects.filter(username__iexact=username).exists():
        return JsonResponse({"error": "Username already exists."}, status=409)

    try:
        with transaction.atomic():
            user = User.objects.create_user(username=username, password=password)
    except IntegrityError:
        return JsonResponse({"error": "Username already exists."}, status=409)

    login(request, user)
    return JsonResponse({"ok": True, "username": user.username}, status=201)


@require_POST
def login_view(request):
    username, password, error = _credentials(request)
    if error:
        return error

    # Django's default backend is case-sensitive. Resolve the stored username
    # case-insensitively so the login behavior matches invite lookup.
    stored = User.objects.filter(username__iexact=username).only("username").first()
    auth_username = stored.username if stored else username
    user = authenticate(request, username=auth_username, password=password)
    if user is None:
        return JsonResponse({"error": "Invalid username or password."}, status=400)

    login(request, user)
    return JsonResponse({"ok": True, "username": user.username})


@require_POST
def logout_view(request):
    logout(request)
    return JsonResponse({"ok": True})


@require_GET
def me_view(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False})
    return JsonResponse({"authenticated": True, "username": request.user.username})
