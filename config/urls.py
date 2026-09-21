from django.contrib import admin
from django.urls import include, path
from games.views import home

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/games/", include("games.urls")),
    path("", home, name="home"),
]
