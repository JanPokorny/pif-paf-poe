# Pif-paf-poe Game Rules

Pif-paf-poe is a board game for two players based on Tic-tac-toe. Like Tic-tac-toe, it is played by alternatingly placing Xs and Os ("stones") on a 3x3 grid, with the goal of having 3-in-a-row (orthogonally or diagonally). Unlike Tic-tac-toe, players arrive with a set of 5 stones each, where each stone can have a specific special effect on the board, either moving stones around after its placement, or restricting where the next stone can be placed. Also unlike Tic-tac-toe, the game continues even after filling the board.

Game progress:

- Each player starts with a set of 5 stones. How they obtain these is out of scope of these rules, think of it as a TCG: whatever arrives, arrives. Stone types can repeat in player's hand. Both players' hands may be different.
- Who starts is selected randomly.
- Each round, A being one whose turn it is, B being the other one:
    - If the board is full, A selects one of B's stones and returns it to B. If B placed a stone with a restriction effect in the preceding turn, and there are B's stones on the board whose return would allow fulfilling the restriciton, A must select only among these.
    - A selects one of their held stones and places it on the board. 
        - If the board has free spaces, A must place on a free space. If not, A must select one of B's stones and return it to their hand to make a space.
        - If B placed a stone with a restriction effect in the preceding turn, the restriction must be adhered to, unless it would lead to no valid placements left. Restriction cannot be circumvented by returning the restricting stone.
    - If the placed stone has a movement effect, A picks a direction and then executes the effect.
    - If the board state, including possible active restrictions from the just placed stone, matches one already seen in this game, B wins.
    - If 3-in-a-row is achieved by A, A wins.
    - If 3-in-a-row is achieved by B, B wins.
    - A<->B switch.

Possible stones:

- Regular: No effect.
- Movement:
    - Shift: Player picks an orthogonal direction. Full row or column with this stone is shifted with overflow in that direction.
    - 2048: Player picks an orthogonal direction. All stones on board move in that direction as far as free space allows.
    - Rotate: Player picks one of 2x2 board sub-squares this stone is part of. Those 4 places are then swapped clockwise.
    - Swap: Player selects a row or column this stone was not placed in. The row or column is swapped with the one this stone was placed in.
- Restriction:
    - Magnet: Other player must place their next stone orthogonally adjacent to this one.
    - Stinky: Other player must NOT place their next stone orthogonally adjacent to this one.
