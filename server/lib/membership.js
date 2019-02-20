const path = require('path');
const fs = require("fs");
const async = require("async")
const logger = require('./logModule');
const aws = require('aws-sdk');
const moment = require('moment');
const fileName = "membership_test.json";

var membership = {
    create: function(req, res, next) {
        const config = req.globalConfig;
        const dateTimeFormat = config.eventConfiguration.dateTimeFormat;
        var s3 = new aws.S3({
            "accessKeyId": process.env.accessKey,
            "secretAccessKey": process.env.secretAccessKey
        });
        try {
            logger.debug("*****The accessKeyId is : "+process.env.accessKey);
            logger.debug("*****The secretAccessKey is : "+process.env.secretAccessKey);
            var newData = req.body;

            logger.debug("request body : " + JSON.stringify(newData));
            async.auto({
                read: function(callback) {
                    //S3 operations
                    var params = {
                        Bucket: config.aws.s3Bucket,
                        Key: `membership/${fileName}`
                    }
                    var fileData = "";
                    s3.getObject(params, function(err, data) {
                    let newMember = {};
			        const emailID = newData.member.emailID;
	                let members = {};
                        if (err) {
                            if (err.statusCode && err.statusCode == 404) {
                                newMember = createMemberObject(newData, dateTimeFormat);
                                members[emailID] = newMember;
                            } else {
                                return callback(err);
                            }
                        } else if (data.Body.length == 0) {
                            logger.debug('inside blank file section : ');
                            newMember = createMemberObject(newData, dateTimeFormat);
                            members[emailID] = newMember;
                        } else {
                            members = JSON.parse(data.Body.toString('utf-8'));
                            if(members[emailID]) {
                                const updatedMember = updateMemberObject(newData, members[emailID], dateTimeFormat)
                                members[emailID] = updatedMember;
                            } else {
                                newMember = createMemberObject(newData, dateTimeFormat);
				                members[emailID] = newMember;
			                } 
                        }
                        return callback(null, members);
                    });

                },
                write: ['read', function(results, callback) {
                    logger.debug('in write_file', JSON.stringify(results));
                    var params = {
                        Bucket: config.aws.s3Bucket,
                        Key: `membership/${fileName}`,
                        ContentEncoding: 'utf-8',
                        Body: JSON.stringify(results["read"]),
                        "ServerSideEncryption": "AES256"
                    }
                    s3.putObject(params, function(err, data) {
                        if (err) {
                            callback(err);
                        } else {
                            return callback(null, "success");
                        }
                    });

                }]
            }, function(err, results) {
                if (err) {
                    return next(err)

                } else {
                    res.status(204);
                    res.send("member successfully created")
                }
            });
        } catch (e) {
            res.status(500);
            return next(e);
        }

    },
    read: function (req, res, next) {
        try {
            const config = req.globalConfig;
            const dateTimeFormat = config.eventConfiguration.dateTimeFormat;
            var s3 = new aws.S3({
                "accessKeyId": process.env.accessKey,
                "secretAccessKey": process.env.secretAccessKey
            });

            var params = {
                "Bucket": config.aws.s3Bucket,
                "Key": `membership/${fileName}`,

            }
            logger.info("*****The accessKeyId is : "+process.env.accessKey);
            logger.info("*****The secretAccessKey is : "+process.env.secretAccessKey);
            logger.debug("params : " + JSON.stringify(params))
            var fileData = "";
            s3.getObject(params, function(err, data) {
                if (err) {
                    if (err.statusCode && err.statusCode == 404) {
                        //Registration file does not exist. Throw 404
                        var returnObj = {
                            "status": 404,
                            "message": "There are no members available."
                        }
                        res.status(404);
                        return res.send(returnObj);
                    } else {
                        return next(err);
                    }
                } else if (data.Body.length == 0) {
                    var returnObj = {
                        "status": 404,
                        "message": "There are no members available."
                    }
                    res.status(404);
                    return res.send(returnObj);
                } else {
                    data = JSON.parse(data.Body.toString('utf-8'));
                    const emailID = req.query.emailID;
                    const primaryMemberName = req.query.primaryMemberName ? req.query.primaryMemberName.toLowerCase(): undefined;
                    member = data[emailID];
                    if (emailID) {
			            if (data[emailID]) {
                            const validUntill = data[emailID].validUntill? moment(data[emailID].validUntill, dateTimeFormat): moment(data[emailID].lastRenewalDate, dateTimeFormat).add(1,'year').endOf('day');
                            data[emailID].isActive = validUntill.isAfter(moment())
			                res.status(200);
                            return res.send(data[emailID]);
			            } else {
			                //member does not exist. throw 404
                            var returnObj = {
                            "status": 404,
                            "message": "Member does not exist"
                            };
			                res.status(404);
                            return res.send(returnObj);
                        }
                        
                    } else if(primaryMemberName) {
                        
                        const matchingMembers = [], retVal = []
                        Object.keys(data).forEach(element => {
                            if(data[element].member.name.toLowerCase().includes(primaryMemberName)) {
                                const validUntill = data[element].validUntill? moment(data[element].validUntill, dateTimeFormat): moment(data[element].lastRenewalDate, dateTimeFormat).add(1,'year').endOf('day');
                                data[element].isActive = validUntill.isAfter(moment());
                                retVal.push(data[element]);        
                            }
                           
                        });
                        if(retVal.length == 0) {
                            var returnObj = {
                                "status": 404,
                                "message": "Member does not exist"
                            };
                            res.status(404);
                            return res.send(returnObj);
                        }
                        res.status(200);
                        return res.send(retVal)

                    }else {
                        const retVal = [];
                        Object.keys(data).forEach(element => {
                            const validUntill = data[element].validUntill? moment(data[element].validUntill, dateTimeFormat): moment(data[element].lastRenewalDate, dateTimeFormat).add(1,'year').endOf('day');
                            data[element].isActive = validUntill.isAfter(moment());
                            retVal.push(data[element]);
                        });
                        res.status(200);
                        return res.send(retVal);
                    }
                }
            });
        } catch (e) {
            res.status(500);
            return next(e);
        }

    },

    readActiveMembers: function (req, res, next) {
        try {
            const config = req.globalConfig;
            const dateTimeFormat = config.eventConfiguration.dateTimeFormat;
            var s3 = new aws.S3({
                "accessKeyId": process.env.accessKey,
                "secretAccessKey": process.env.secretAccessKey
            });

            var params = {
                "Bucket": config.aws.s3Bucket,
                "Key": `membership/${fileName}`,

            }
            logger.debug("*****The accessKeyId is : "+process.env.accessKey);
            logger.debug("*****The secretAccessKey is : "+process.env.secretAccessKey);
            
            var fileData = "";
            s3.getObject(params, function(err, data) {
                if (err) {
                    if (err.statusCode && err.statusCode == 404) {
                        //Membership file does not exist. Throw 404
                        var returnObj = {
                            "status": 404,
                            "message": "There are no members available."
                        }
                        res.status(404);
                        return res.send(returnObj);
                    } else {
                        return next(err);
                    }
                } else if (data.Body.length == 0) {
                    var returnObj = {
                        "status": 404,
                        "message": "There are no members available."
                    }
                    res.status(404);
                    return res.send(returnObj);
                } else {
                    data = JSON.parse(data.Body.toString('utf-8'));
                    
                    const retVal = [];
                    Object.keys(data).forEach(element => {
                        const validUntill = data[element].validUntill? moment(data[element].validUntill, dateTimeFormat): moment(data[element].lastRenewalDate, dateTimeFormat).add(1,'year').endOf('day');
                        if (validUntill.isAfter(moment())){
                            // only return active members
                            retVal.push(data[element]);
                        }
                    });
                    res.status(200);
                    return res.send(retVal);
                     
                }
            });
        } catch (e) {
            res.status(500);
            return next(e);
        }

    }
}

function createMemberObject(newData, dateTimeFormat) {
    const emailID = newData.member.emailID;
    const now = moment();
    let spouseName, spouseEmailID, spouseContactNo;
    if (newData.spouse) {
        spouseName = newData.spouse.name || '';
        spouseEmailID = newData.spouse.emailID || '';
        spouseContactNo = newData.spouse.contactNo || ''
    }
    const membership = {
        type: newData.type,
        member: {
            'name': newData.member.name,
            'emailID': newData.member.emailID,
            'contactNo': newData.member.contactNo
        },
        spouse: {
            'name': spouseName,
            'emailID': spouseEmailID,
            'contactNo': spouseContactNo
        },
        noOfChildren: newData.noOfChildren || 0,
        createDate: now.format(dateTimeFormat),
        lastRenewalDate: now.format(dateTimeFormat),
        validUntill: now.add(1, 'year').endOf('day').format(dateTimeFormat),
    };
    return membership;
}

function updateMemberObject(newData, existingObj, dateTimeFormat) {
    const emailID = existingObj.member.emailID;
    const createDate = existingObj.createDate;
    const now = moment();
    let spouseName, spouseEmailID, spouseContactNo;
    if (newData.spouse) {
        spouseName = newData.spouse.name || '';
        spouseEmailID = newData.spouse.emailID || '';
        spouseContactNo = newData.spouse.contactNo || ''
    }
    const membership = {
        type: newData.type,
        member: {
            'name': newData.member.name,
            'emailID': emailID,
            'contactNo': newData.member.contactNo
        },
        spouse: {
            'name': spouseName,
            'emailID': spouseEmailID,
            'contactNo': spouseContactNo
        },
        noOfChildren: newData.noOfChildren || 0,
        createDate: createDate,
        lastRenewalDate: now.format(dateTimeFormat),
    };
    existingObj.lastRenewalDate = now.format(dateTimeFormat);
    const validUntillDateStr = existingObj.validUntill;
    if(validUntillDateStr) {
        // extend another year. This willalso amke sure that people get correct extension if they pay twice
        membership.validUntill = moment(validUntillDateStr,dateTimeFormat).add(1, 'year').endOf('day').format(dateTimeFormat);
    } else {
        // for existing data which does not yet have valid until
        membership.validUntill = now.add(1, 'year').endOf('day').format(dateTimeFormat);
    }
    return membership;
}

module.exports = membership;
