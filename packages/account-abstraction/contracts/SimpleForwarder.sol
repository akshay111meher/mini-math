// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IERC721 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

interface IERC721Receiver {
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}

contract TreasuryForwarder is IERC721Receiver {
    address payable public constant TREASURY =
        payable(0x29e78bB5ef59a7fa66606c665408D6E680F5a06f);

    receive() external payable {}
    fallback() external payable {}

    function forwardETH() external {
        uint256 bal = address(this).balance;
        require(bal > 0);
        (bool ok, ) = TREASURY.call{value: bal}("");
        require(ok);
    }

    function forwardERC20(address token) external {
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0);
        bool ok = IERC20(token).transfer(TREASURY, bal);
        require(ok);
    }

    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        IERC721(msg.sender).safeTransferFrom(address(this), TREASURY, tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }

    function forwardERC721(address token, uint256 tokenId) external {
        IERC721(token).safeTransferFrom(address(this), TREASURY, tokenId);
    }
}