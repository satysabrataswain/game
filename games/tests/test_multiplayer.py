import json

from django.contrib.auth.models import User
from django.test import Client, TestCase

from games.models import BingoMatch, FriendRequest


class MultiplayerBingoTests(TestCase):
    def setUp(self):
        self.player1 = User.objects.create_user(username="player1", password="secret1")
        self.player2 = User.objects.create_user(username="player2", password="secret2")
        self.client1 = Client()
        self.client2 = Client()
        self.client1.force_login(self.player1)
        self.client2.force_login(self.player2)

    @staticmethod
    def post_json(client, path, payload=None):
        return client.post(
            path,
            data=json.dumps(payload or {}),
            content_type="application/json",
        )

    def create_match(self):
        response = self.post_json(
            self.client1,
            "/api/games/friends/request/",
            {"username": "player2"},
        )
        self.assertEqual(response.status_code, 201)
        request_id = response.json()["request"]["id"]
        accepted = self.post_json(
            self.client2,
            f"/api/games/friends/{request_id}/accept/",
        )
        self.assertEqual(accepted.status_code, 201)
        return BingoMatch.objects.get()

    def test_reverse_duplicate_invite_is_rejected(self):
        first = self.post_json(
            self.client1,
            "/api/games/friends/request/",
            {"username": "player2"},
        )
        self.assertEqual(first.status_code, 201)
        reverse = self.post_json(
            self.client2,
            "/api/games/friends/request/",
            {"username": "player1"},
        )
        self.assertEqual(reverse.status_code, 409)
        self.assertEqual(FriendRequest.objects.filter(status="PENDING").count(), 1)

    def test_match_boards_are_different_and_private(self):
        match = self.create_match()
        p1_data = self.client1.get(f"/api/games/friend-match/{match.id}/").json()
        p2_data = self.client2.get(f"/api/games/friend-match/{match.id}/").json()

        self.assertNotEqual(p1_data["state"]["board"], p2_data["state"]["board"])
        for payload in (p1_data, p2_data):
            self.assertNotIn("player1_board", payload["state"])
            self.assertNotIn("player2_board", payload["state"])
            self.assertNotIn("opponent_board", payload["state"])
            self.assertIsNone(payload["state"]["opponent_lines"])

    def test_move_is_green_for_caller_and_red_for_opponent(self):
        match = self.create_match()
        p1_view = self.client1.get(f"/api/games/friend-match/{match.id}/").json()
        number = p1_view["state"]["board"][0]

        moved = self.post_json(
            self.client1,
            f"/api/games/friend-match/{match.id}/move/",
            {"move": number},
        )
        self.assertEqual(moved.status_code, 200)
        self.assertIn(number, moved.json()["state"]["my_calls"])
        self.assertNotIn(number, moved.json()["state"]["opponent_calls"])

        opponent_view = self.client2.get(f"/api/games/friend-match/{match.id}/").json()
        self.assertIn(number, opponent_view["state"]["opponent_calls"])
        self.assertNotIn(number, opponent_view["state"]["my_calls"])

        second_number = next(value for value in opponent_view["state"]["board"] if value != number)
        second_move = self.post_json(
            self.client2,
            f"/api/games/friend-match/{match.id}/move/",
            {"move": second_number},
        )
        self.assertEqual(second_move.status_code, 200)
        self.assertIn(second_number, second_move.json()["state"]["my_calls"])

        p1_after = self.client1.get(f"/api/games/friend-match/{match.id}/").json()
        self.assertIn(second_number, p1_after["state"]["opponent_calls"])

    def test_out_of_turn_and_duplicate_call_are_rejected(self):
        match = self.create_match()
        number = match.player1_board[0]

        out_of_turn = self.post_json(
            self.client2,
            f"/api/games/friend-match/{match.id}/move/",
            {"move": number},
        )
        self.assertEqual(out_of_turn.status_code, 409)

        first = self.post_json(
            self.client1,
            f"/api/games/friend-match/{match.id}/move/",
            {"move": number},
        )
        self.assertEqual(first.status_code, 200)

        duplicate = self.post_json(
            self.client2,
            f"/api/games/friend-match/{match.id}/move/",
            {"move": number},
        )
        self.assertEqual(duplicate.status_code, 400)


    def test_forfeit_closes_match_and_allows_new_invite(self):
        match = self.create_match()
        forfeited = self.post_json(
            self.client1,
            f"/api/games/friend-match/{match.id}/forfeit/",
        )
        self.assertEqual(forfeited.status_code, 200)
        match.refresh_from_db()
        self.assertEqual(match.status, BingoMatch.STATUS_FINISHED)
        self.assertEqual(match.result, BingoMatch.RESULT_PLAYER2)

        new_invite = self.post_json(
            self.client1,
            "/api/games/friends/request/",
            {"username": "player2"},
        )
        self.assertEqual(new_invite.status_code, 201)

    def test_invalid_json_returns_400(self):
        response = self.client1.post(
            "/api/games/friends/request/",
            data="{broken",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
