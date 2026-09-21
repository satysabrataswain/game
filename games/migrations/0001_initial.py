# Generated for GameHub multiplayer Bingo.
import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="FriendRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("pair_key", models.CharField(db_index=True, max_length=64)),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("ACCEPTED", "Accepted"), ("DECLINED", "Declined"), ("CANCELLED", "Cancelled")], default="PENDING", max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("receiver", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="received_game_invites", to=settings.AUTH_USER_MODEL)),
                ("sender", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sent_game_invites", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="BingoMatch",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("pair_key", models.CharField(db_index=True, max_length=64)),
                ("player1_board", models.JSONField(default=list)),
                ("player2_board", models.JSONField(default=list)),
                ("calls", models.JSONField(default=list)),
                ("call_owners", models.JSONField(default=list)),
                ("player1_lines", models.PositiveSmallIntegerField(default=0)),
                ("player2_lines", models.PositiveSmallIntegerField(default=0)),
                ("status", models.CharField(choices=[("ACTIVE", "Active"), ("FINISHED", "Finished")], default="ACTIVE", max_length=10)),
                ("result", models.CharField(blank=True, choices=[("", "No result"), ("PLAYER1", "Player 1"), ("PLAYER2", "Player 2"), ("DRAW", "Draw")], default="", max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("current_player", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="bingo_turns", to=settings.AUTH_USER_MODEL)),
                ("player1", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="bingo_matches_as_player1", to=settings.AUTH_USER_MODEL)),
                ("player2", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="bingo_matches_as_player2", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-updated_at"]},
        ),
        migrations.AddConstraint(
            model_name="friendrequest",
            constraint=models.UniqueConstraint(condition=models.Q(status="PENDING"), fields=("pair_key",), name="unique_pending_game_invite_per_pair"),
        ),
        migrations.AddConstraint(
            model_name="bingomatch",
            constraint=models.UniqueConstraint(condition=models.Q(status="ACTIVE"), fields=("pair_key",), name="unique_active_bingo_match_per_pair"),
        ),
    ]
