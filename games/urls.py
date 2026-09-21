from django.urls import path

from . import views

urlpatterns = [
    path("start/", views.start_game, name="start_game"),

    path("friends/state/", views.friend_state, name="friend_state"),
    path("friends/request/", views.send_friend_request, name="send_friend_request"),
    path("friends/<int:request_id>/accept/", views.accept_friend_request, name="accept_friend_request"),
    path("friends/<int:request_id>/decline/", views.decline_friend_request, name="decline_friend_request"),
    path("friends/<int:request_id>/cancel/", views.cancel_friend_request, name="cancel_friend_request"),

    path("friend-match/<uuid:match_id>/", views.get_friend_match, name="get_friend_match"),
    path("friend-match/<uuid:match_id>/move/", views.friend_match_move, name="friend_match_move"),
    path("friend-match/<uuid:match_id>/forfeit/", views.forfeit_friend_match, name="forfeit_friend_match"),

    path("<str:game_id>/", views.get_game, name="get_game"),
    path("<str:game_id>/move/", views.make_move, name="make_move"),
]
