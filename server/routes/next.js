const isObjectId = require('mongoose').Types.ObjectId.isValid;
const toObjectId = require('mongoose').Types.ObjectId;
const userModel = require('../models/user');
const roomModel = require('../models/room');
const onlineModel = require('../models/online');
const onlineSocketMiddleware = require('../socket/middlewares/online');
module.exports = function(server, app) {
	function checkLogin(unAuthPath) {
		return (req, res) => {
			if (req.isAuthenticated()) {
				return app.render(req, res, req.path);
			}
			return app.render(req, res, unAuthPath || '/login');
		};
	}
	server.get('/', checkLogin());
	server.get('/chat', checkLogin());
	server.get('/chat/:roomId', async (req, res) => {
		if (!req.isAuthenticated()) {
			return app.render(req, res, '/login');
		}
		const { roomId } = req.params;
		if (!isRoomId(roomId) && req.isAuthenticated()) {
			const room = await findOrCreateRoom(roomId, req.user._id);
			if (room) return app.render(req, res, `/chat/${room._id}`);
		}
		const lastOnline = await getOnlineState(
			req.user._id.toString(),
			onlineSocketMiddleware.socketManager,
		);
		return app.render(req, res, req.path, { online: lastOnline });
	});
	server.get('/login', checkLogin());
	server.get('/logon', checkLogin('/logon'));
};
function isRoomId(roomId) {
	return isObjectId(roomId);
}
async function findOrCreateRoom(userName, myUserId) {
	const user = await userModel.findByUsername(userName).lean();
	if (!user) {
		return false;
	}
	const room = await roomModel.findOne({
		$and: [
			{ members: { $eq: [toObjectId(user._id), toObjectId(myUserId)] } },
			{
				members: {
					$size: 2,
				},
			},
			{
				type: 'inbox',
			},
		],
	});
	if (room) return room;
	return roomModel.create({
		members: [toObjectId(user._id), toObjectId(myUserId)],
		type: 'inbox',
		creator: toObjectId(myUserId),
	});
}

async function getOnlineState(userId, socketManager) {
	if (socketManager.isOnline(userId)) {
		return true;
	}
	const record = await onlineModel.getLastOnlineRecord(userId);
	return record && record.createdAt;
}
