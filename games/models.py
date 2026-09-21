import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class FriendRequest(models.Model):
    STATUS_PENDING = "PENDING"
    STATUS_ACCEPTED = "ACCEPTED"
    STATUS_DECLINED = "DECLINED"
    STATUS_CANCELLED = "CANCELLED"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_DECLINED, "Declined"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_game_invites",
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_game_invites",
    )
    # Canonical unordered key, e.g. "4:19". This prevents duplicate/reverse
    # pending invites for the same pair at the database level.
    pair_key = models.CharField(max_length=64, db_index=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["pair_key"],
                condition=Q(status="PENDING"),
                name="unique_pending_game_invite_per_pair",
            )
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.sender} -> {self.receiver} ({self.status})"


class BingoMatch(models.Model):
    STATUS_ACTIVE = "ACTIVE"
    STATUS_FINISHED = "FINISHED"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_FINISHED, "Finished"),
    ]

    RESULT_NONE = ""
    RESULT_PLAYER1 = "PLAYER1"
    RESULT_PLAYER2 = "PLAYER2"
    RESULT_DRAW = "DRAW"
    RESULT_CHOICES = [
        (RESULT_NONE, "No result"),
        (RESULT_PLAYER1, "Player 1"),
        (RESULT_PLAYER2, "Player 2"),
        (RESULT_DRAW, "Draw"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pair_key = models.CharField(max_length=64, db_index=True)

    player1 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bingo_matches_as_player1",
    )
    player2 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bingo_matches_as_player2",
    )

    # Each board is independently shuffled. The opponent board is never sent
    # to the browser.
    player1_board = models.JSONField(default=list)
    player2_board = models.JSONField(default=list)

    # Chronological called numbers and the owner of each call. A called number
    # is shared for Bingo line calculation, but its owner controls its color:
    # own call = green, opponent call = red.
    calls = models.JSONField(default=list)
    call_owners = models.JSONField(default=list)

    player1_lines = models.PositiveSmallIntegerField(default=0)
    player2_lines = models.PositiveSmallIntegerField(default=0)

    current_player = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bingo_turns",
    )

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    result = models.CharField(max_length=10, choices=RESULT_CHOICES, blank=True, default=RESULT_NONE)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["pair_key"],
                condition=Q(status="ACTIVE"),
                name="unique_active_bingo_match_per_pair",
            )
        ]
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.player1} vs {self.player2} ({self.status})"
