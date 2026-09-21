import random

from django.test import SimpleTestCase

from games.services import bingo


class BingoServiceTests(SimpleTestCase):
    def test_two_boards_are_valid_and_different(self):
        board1, board2 = bingo.make_two_boards()
        self.assertEqual(sorted(board1), list(range(1, 26)))
        self.assertEqual(sorted(board2), list(range(1, 26)))
        self.assertNotEqual(board1, board2)

    def test_completed_line_indexes_are_returned(self):
        board = list(range(1, 26))
        lines = bingo.completed_lines(board, [1, 2, 3, 4, 5])
        self.assertIn([0, 1, 2, 3, 4], lines)

    def test_simultaneous_five_lines_is_draw(self):
        self.assertEqual(bingo.result_for_scores(5, 5), "DRAW")

    def test_cpu_state_splits_call_owner_colors(self):
        random.seed(10)
        state = bingo.new_state()
        state = bingo.play(state, state["user_board"][0])
        public = bingo.public_state(state)
        self.assertEqual(len(public["my_calls"]), 1)
        if state["status"] == "ACTIVE":
            self.assertEqual(len(public["opponent_calls"]), 1)
        self.assertNotIn("cpu_board", public)
