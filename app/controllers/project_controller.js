require('rootpath')();
var logger = require('config/winston');
const path = require('path');
var appRoot = require('app-root-path');

var User = require('app/models/user');
var Project = require('app/models/project');
var Comment = require('app/models/comment');



var DocumentGroup = require('app/models/document_group')
var DocumentGroupAnnotation = require('app/models/document_group_annotation')



var Document = require('app/models/document')
var DocumentAnnotation = require('app/models/document_annotation')


var ProjectInvitation = require('app/models/project_invitation')

var mongoose = require('mongoose');

/* GET Actions */

// GET: The project dashboard. Renders the projects page that lists all the projects of a user.
// Doesn't actually send any projects - that's done by 'getProjects', via AJAX.
// module.exports.index = function(req, res) {
//   req.user.getProjects(function(err, projects) {
//     if(err) return res.send(err);
//     res.render('projects', { title: "Projects" })
//   });  
// }



// GET (AJAX): Return some basic details of the projects that this user is involved in.
module.exports.getProjects = function(req, res) {
  try {
  Project.getInvolvedProjectData(req.user, function(err, data) {
    if(err) return res.send(err);
    res.send(data);
  });
} catch(err) { console.log(err); }
}

// // GET (AJAX): A function that returns all the projects of a user.
// // This should be called via AJAX to populate the projects table.
// module.exports.getProjects = function(req, res) {
//   req.user.getProjectsTableData(function(err, projects) {
//     if(err) return res.send(err);
//     res.send({projects: projects});
//   });
// }






/* Miscellaneous controller actions (which should probably be in a separate file) */

// Automatically tag all tokens on the screen that appear in the dictionary.
// Returns an array of [{ mentions: [] }, { mentions: [] }] (one mentions array per document)
function runDictionaryTagging(Document, dictionary) {
  // Build the automatic annotations based on the groupData.
  var automaticAnnotations = [];

  for(var doc_id = 0; doc_id < Document.length; doc_id++) {
    var doc = Document[doc_id];
    var mentions = [];
      //console.log(doc)

    labeledTokens = new Array(doc.length);
    for(var x = i; x < labeledTokens.length; x++) {
      labeledTokens[x] = 0;              
    }

    for(var ngram_size = 3; ngram_size >= 1; ngram_size--) {
      //console.log("NGRAM SIZE:", ngram_size)
      for(var i = 0; i < doc.length - ngram_size + 1; i++) {
        var ngram = doc.slice(i, i + ngram_size).join(" ")

        if(dictionary.hasOwnProperty(ngram)) {
          //console.log(ngram, "is in the dictionary! Class:", dictionary[ngram])
          
          var start = i;
          var end = i + ngram_size;
          alreadyLabeled = false;
          for(var x = i; x < end; x++) {
            if(labeledTokens[x] > 0) {
              alreadyLabeled = true;
            }
          }

          if(!alreadyLabeled) {
            mentions.push({start: start, end: end, labels: dictionary[ngram]});
            for(var x = i; x < end; x++) {
              labeledTokens[x] = 1;              
            }
          }
        }
      }
    }
    automaticAnnotations.push({'mentions': mentions});
    
  }

  return automaticAnnotations;
}



// TODO : Move these utility functions elsewhere

// Remove empty children from the JSON data.
function removeEmptyChildren(obj) {
  if(obj["children"].length == 0) {
    delete obj["children"];
  } else {
    for(var k in obj["children"]) {
      removeEmptyChildren(obj["children"][k]);
    }
  }
}

function slash2txt(slash) {
  var txt = [];
  for(var i = 0; i < slash.length; i++) {
    txt.push(slash[i].replace(/[^\/]*\//g, ' ')); // Replace any forwardslashes+text with a space.
  }
  return txt.join("\n");
}

function txt2json(text, slash) {
  var fieldname = "name";

  var lines = text.split('\n');  
  var depth = 0; // Current indentation
  var root = {
    "children": []
  };
  root["" + fieldname] = "entity";
  var parents = [];
  var node = root;
  var colorId = -1;
  for(var i = 0; i < lines.length; i++) {
    var cleanLine = lines[i].trim()//replace(/\s/g, "");
    var newDepth  = lines[i].search(/\S/) + 1;
    if(newDepth == 1) colorId++;
    if(newDepth < depth) {
      parents = parents.slice(0, newDepth);      
    } else if (newDepth == depth + 1) {      
      parents.push(node);
    } else if(newDepth > depth + 1){
      return new Error("Unparsable tree.");
    }
    depth = newDepth;
    node = {"id": i, "children": [], "colorId": colorId};
    node[fieldname] = cleanLine;
    node['full_name'] = slash[i];
    if(parents.length > 0) {
      parents[parents.length-1]["children"].push(node);
    }
  }
  removeEmptyChildren(root); // Remove 'children' properties of all nodes without children
  return root;
}







// GET (AJAX): Retrieve a previously annotated document group for this project.
// Called when the user navigates between pages.
module.exports.getPreviouslyAnnotatedDocumentGroup = function(req, res) {
  var id = req.params.id;
  try {
    var pageNumber = parseInt(req.query.pageNumber);
  } catch(err) {
    return res.send("Error: could not parse page number");
  }
  if(pageNumber < 1) {
    return res.send("Error: Page number must be >= 1");
  }

  Project.findOne({ _id: id }, function(err, proj) {
    if(err) { return res.send("error"); }

    proj.getDocumentsAnnotatedByUser(req.user, function(err, annotatedDocGroups) {
      if(err) { return res.send("error"); }

      if(pageNumber > annotatedDocGroups.length) {
        return res.send("Error: Page number must be lower than number of doc groups annotated so far");
      }

      var dga = annotatedDocGroups[pageNumber - 1];

      var tree = txt2json(slash2txt(proj.category_hierarchy), proj.category_hierarchy)

      var Document = require('app/models/document_group');
      Document.findById({_id: dga.document_group_id}, function(err, docgroup) {
        if(err) { return res.send("error: docgroup not found"); }
        dga.toMentionsJSON(function(err, mentionsJSON) {
          if(err) { return res.send(err); }


          proj.getDocumentsPerUser(function(err, docGroupsPerUser) {
            proj.getDocumentsAnnotatedByUserCount(req.user, function(err, numAnnotatedDocGroups) {
              proj.getDocgroupCommentsArray(docgroup, function(err, comments) {



                res.send({
                  DocumentId:            docgroup._id,
                  Document:              docgroup.documents,
                  DocumentAnnotationId:  dga._id,
                  automaticAnnotations:       mentionsJSON,
                  comments:                   comments,
                  entityClasses:              proj.category_hierarchy,
                  categoryHierarchy:          tree,
                  annotatedDocGroups:         numAnnotatedDocGroups,
                  pageNumber:                 pageNumber,
                  projectName:                proj.project_name,     
                  lastModified:               dga.updated_at,
                  docGroupsPerUser:           docGroupsPerUser,
                  username:                   req.user.username,
                });
              });
            });
          });
        });
      })
    });
  });
}

// GET (AJAX): Retrieve a single document group for the tagging interface.
module.exports.getDocumentGroup = function(req, res) {
  var id = req.params.id;
  Project.findOne({ _id: id }, function(err, proj) {
    if(err) {
      res.send("error");
    }
    console.log("PROJECT", proj._id)
    console.log("USER", req.user.username)

    proj.getDocumentsAnnotatedByUserCount(req.user, function(err, numAnnotatedDocGroups) {
      proj.recommendDocgroupToUser(req.user, function(err, docgroup) {
        //console.log(err, docgroup)

        console.log(err);
        if(err) {
          if(err.message == "No document groups left") {
            return res.send({
              tagging_complete: true,
              annotatedDocGroups: numAnnotatedDocGroups,
              projectName: proj.project_name,
            });
          }
          return res.send("error");
        } else {     

          logger.debug("Sending doc group id: " + docgroup._id)

          var tree = txt2json(slash2txt(proj.category_hierarchy), proj.category_hierarchy)
          //console.log("tree:", tree);

          if(proj.automatic_tagging_dictionary) {
            var automaticAnnotations = runDictionaryTagging(docgroup.documents, proj.automatic_tagging_dictionary)
          } else {
            var automaticAnnotations = null;
          }

          
          proj.getDocumentsPerUser(function(err, docGroupsPerUser) {   

            proj.getDocgroupCommentsArray(docgroup, function(err, comments) {


              User.findById({_id: proj.user_id}, function(err, user) {

                res.send({
                    DocumentId:        docgroup._id,
                    Document:          docgroup.documents,
                    automaticAnnotations:   automaticAnnotations,
                    comments:               comments,
                    entityClasses:          proj.category_hierarchy,
                    categoryHierarchy:      tree,
                    annotatedDocGroups:     numAnnotatedDocGroups,
                    pageNumber:             numAnnotatedDocGroups + 1, // numAnnotatedDocGroups + 1 is the latest page        
                    projectName:            proj.project_name, 
                    docGroupsPerUser:       docGroupsPerUser,
                    username:               req.user.username,

                    projectTitle:           proj.project_name,
                    projectAuthor:          user.username,

                });

              });
            });            
          });
        }  
      });
    });
  });
}



// POST (AJAX): Submit the annotations of the user for the current document group.
// 
module.exports.submitAnnotations = function(req, res) {
  var User = require('app/models/user');
  var DocumentId = req.body.DocumentId;
  var userId = req.user._id;
  var projectId = req.params.id;
  var labels = req.body.labels;

  var DocumentAnnotationId = req.body.DocumentAnnotationId; // if null, this document group annotation is new

  // If this is an existing DocumentAnnotation, find the corresponding record and proceed to save it and send its details to the user
  if(DocumentAnnotationId) {  
    DocumentAnnotation.findById({_id: DocumentAnnotationId}, function(err, DocumentAnnotation) {
      if(err) { return res.send("error"); }
      //console.log("DGA:", DocumentAnnotation);
      DocumentAnnotation.labels = labels;

      proceed(req, res, DocumentAnnotation, false);
    });

  // If this a brand new document group annotation, create a new object to save to the database.
  } else {
    var DocumentAnnotation = new DocumentAnnotation({
      user_id: userId,
      document_group_id: DocumentId,
      labels: labels,
    });
    proceed(req, res, DocumentAnnotation, true);
  }


  // Awkward having another function here but it seems to be the best way to keep the code the same for both conditions above.
  function proceed(req, res, DocumentAnnotation, newDGA) {

    DocumentAnnotation.save(function(err, dga) {

      if(err) {
        logger.error(err.stack);
        return res.send({error: err})
      }

      //console.log("Saved");
      
      // Add the docgroup to the user's docgroups_annotated array.
      User.findByIdAndUpdate(userId, { $addToSet: { 'docgroups_annotated': DocumentId }}, function(err) {
        if(err) {
          logger.error(err.stack);
          return res.send({error: err})
        }


          // Update the document group's times_annotated field
          if(newDGA) {
            Document.update({_id: DocumentId}, { $inc: {times_annotated: 1 } }, function(err) {
              if(err) return res.send("error");
              logger.debug("Saved document group annotation " + dga._id)
              res.send({success: true, DocumentAnnotationId: dga._id});
            });
          } else {
            logger.debug("Updated document group annotation " + dga._id);
            res.send({success: true, DocumentAnnotationId: dga._id});
          }   


                
         
      });
    });
  }  
}




// GET: Download the annotations of the user. Sends the user a file.
module.exports.downloadAnnotationsOfUser = function(req, res) {
  var User = require('app/models/user')
  var proj_id = req.params.id;
  var user_id = req.params.user_id;

  

  User.findById(user_id, function(err, user) {
    //console.log(user)
    Project.findById(proj_id, function(err, proj) {
      //console.log(err, proj)
      if(!proj.user_id.equals(req.user._id)) {
        return res.send("error");
      }
      proj.getAnnotationsOfUserForProject(user, function(err, annotations) {
        proj.getEntityTypingAnnotations(annotations, function(err, et_annotations) {          
          if(err) { return res.send("error"); }

          res.type('.json');
          res.setHeader('Content-type', "application/octet-stream");
          res.set({"Content-Disposition":"attachment; filename=\"annotations-" + user.username + ".json\""});
          var out = [];
          for(var line in et_annotations) {
            out.push(JSON.stringify(et_annotations[line]));
          }
          res.send(out.join('\n'));
          //res.send(annotations);
        });        
      })
    });
  });
}

// GET: Download all combined annotations of all users for this project.
// Sends the user a file.
module.exports.downloadCombinedAnnotations = function(req, res) {
  var proj_id = req.params.id;
  Project.findById(proj_id, function(err, proj) {
    console.log(err);
    proj.getCombinedAnnotations(function(err, annotations) {
      if(err) return res.send(err);
      proj.getEntityTypingAnnotations(annotations, function(err, et_annotations) {   
        if(err) return res.send(err);
        res.type('.txt');
        res.setHeader('Content-type', "application/octet-stream");
        res.set({"Content-Disposition":"attachment; filename=\"annotations-combined.json\""});
        var out = [];
        for(var line in et_annotations) {
          out.push(JSON.stringify(et_annotations[line]));
        }
        res.send(out.join('\n'));
      });
    });
  });
}




// GET (AJAX): function to retrieve details of a project (annotators, metrics).
module.exports.getProjectDetails = function(req, res) {
  var id = req.params.id;

  console.log('hello')

  Project.findOne({ _id: id}, function(err, proj) {

    proj.getDetails(function(err, data) {

      proj.getDocumentsAnnotatedByUserCount(req.user, function(err, userDocsAnnotated) {
        proj.getDocumentsPerUser(function(err, userAnnotationsRequired) { 

          if(err) { return res.send("error") }

          data.dashboard.userDocsAnnotated = userDocsAnnotated;
          data.dashboard.userAnnotationsRequired = Math.floor(userAnnotationsRequired);
          
          res.send(data);

        });
      });
    });
  });
}



module.exports.submitComment = function(req, res) {

  console.log("Submitting comment...");

  try {

    var document_index = req.body.documentIndex;
    var document_group_id = req.body.DocumentId;
    var document_string = req.body.documentString;
    var text = req.body.text;

    var project_id = req.params.id;

    var comment = new Comment({
      author: req.user.username,
      user_id: req.user._id,
      project_id: project_id,
      document_group_id: document_group_id,
      document_index: document_index,
      text: text,
      document_string: document_string,

    });  
    comment.save(function(err, comment) {
      if(err) { console.log(err); return res.status(500).send({"error": "could not save comment"})}
      console.log("Comment saved OK", comment);


      // Append the profile icon to the comment
      var comment2 = JSON.parse(JSON.stringify(comment));
      comment2.user_profile_icon = req.user.profile_icon;

      console.log("COMMENT:", comment2);

      res.send({comment: comment2});
    })
  } catch(err) {
    res.status(500).send({"error": "could not save comment"})
  }
}



// POST: Modify the category hierarchy.
// TODO: Connect this up to the interface again (it is not currently in the interface).
module.exports.modifyHierarchy = function(req, res) {
  var project_id = req.params.id;
  var new_hierarchy = req.body.new_hierarchy;

  // TODO: Verify that the category hierarchy is able to be modified in the project options.
  Project.findById(project_id, function(err, proj) {
    proj.modifyHierarchy(new_hierarchy, req.user, function(err) {
      if(err) { logger.error(err.stack); return res.status(400).send(); }
      res.send({"success": true});
    });
  });
}






// POST: Accept an invitation.
module.exports.acceptInvitation = function(req, res) {
  var invitation_id = req.params.id;

  // TODO: Verify user is same as user_email in ProjectInvitation object
  ProjectInvitation.findById(invitation_id, function(err, invitation) {
    if(err) { return res.send("error"); }
    invitation.acceptInvitation(function(err) {
      if(err) { return res.send("error"); }
      res.send({success: true});
    });    
  });  
}

// POST: Decline an invitation.
module.exports.declineInvitation = function(req, res) {
  var invitation_id = req.params.id;
  // TODO: Verify user is same as user_email in ProjectInvitation object
  ProjectInvitation.findById(invitation_id, function(err, invitation) {
    if(err) { return res.send("error"); }
    invitation.declineInvitation(function(err) {
      if(err) { return res.send("error"); }
      res.send({success: true});
    });    
  });
}


