Images = new Mongo.Collection('images');
Slideshow = new Mongo.Collection('slideshow')

FileSlide = {
  path: function () {
    var path = process.env.IMAGES
    if (path == undefined) {
      console.log("You must specify a path to the image folder with the ENV variable IMAGES. Example:")
      console.log('IMAGES="~/Documents/Images/" meteor')
    }
    return path
  },
  last: function () {
    return Images.findOne({}, {sort: {order: -1}})
  },
  add: function (path) {
    var fs = Meteor.npmRequire('fs')
    if (this.isImage(path)) {
      var name = FileSlide.fileName(path)
      var last = FileSlide.last()
      var order = last === undefined ? 0 : last.order + 1
      console.log("adding file", path, name, order)
      Images.insert({
        path: name,
        order: order
      })
    }
  },
  remove: function (path) {
    Images.remove({path: this.fileName(path)})
    Images.remove({path: path})
  },
  merge: function (diskFiles, dbFiles) {
    var mapFunc = function (path) {
      return FileSlide.fileName(path)
    }
    diskFiles = diskFiles.map(mapFunc)
    dbFiles = dbFiles.map(mapFunc)
    
    diskFiles.map(function (path) {
      if (dbFiles.indexOf(path) === -1) {
        FileSlide.add(path);
      }
    })
    
    dbFiles.map(function (path) {
      if (diskFiles.indexOf(path) === -1) {
        FileSlide.remove(path);
      }
    })
  },
  isImage: function (path) {
    var Path = Meteor.npmRequire('path')
    var ext = Path.extname(path).toLowerCase()
    return [".png", ".jpg", ".jpeg", ".gif"].indexOf(ext) != -1
  },
  fileName: function (filePath) {
    var Path = Meteor.npmRequire('path')
    return Path.basename(filePath)
  },
  images: function (page) {
    return Images.find().fetch()
  },
  machine: {
    current: Images.findOne(),
    next: function () {
      return Images.findOne({order: { $gt: this.current.order }})
    }
  }
}

if (Meteor.isClient) {
    //
  // Template.slideshow.helpers({
  //   images: function () {
  //     return Slideshow.find({}, {sort: {i: 1}})
  //   }
  // });
  
  Meteor.autosubscribe(function(){
    Meteor.subscribe("slideshow");
  });
  
  Meteor.autorun(function () {
    var images = Slideshow.find({}, {sort: {i: 1}}).fetch();
    console.log(images)
    
    var src = images.map(function (image) {
      return "images/" + image.path
    })
    
    var animIn = function (item, done) {
      item.fadeIn("slow", done)
      return item
    }
    var animOut = function (item, done) {
      item.fadeOut("slow", done)
      return item
    }
      
    var cache = $("#cache")
    var live = $("#live")
      
    cache.empty()
    
    images.forEach(function (image, i) {
      console.log("*", image, i);
      var img = $("<img>");
      var src = "/images/" + image.path;
      img.attr("src", src);
      cache.append(img)
    })
    
    var showImage = function (image) {
      var hidden = live.find("img.hidden");
      var visible = live.find("img:not(.hidden)");
      
      var newSrc = "/images/" + image.path;
      var oldSrc = visible.attr("src");
    
      hidden.attr("src", newSrc).fadeIn("slow", function () {
        $(this).removeClass("hidden")
      })
      visible.attr("src", oldSrc).fadeOut("slow", function () {
        $(this).addClass("hidden")
      })
    }
    
    if (images.length > 0) {
      showImage(images[0])
    }
        
    // animOut(old)
    //
    // animOut($("img"))
    // animIn($("img:nth-child(2)"), function () {
    //   $("img").each(function (i) {
    //     $(this).setAttr("src", src[i])
    //   })
    // }).attr("src", src[0])
    // $("img:first").fadeIn("slow")
  })
  
  // Template.image.rendered = function () {
  //   $("img:first").show().fadeOut("slow")
  //   $("img:nth-child(2)").fadeIn("slow")
  // }
}

var BIND = Meteor.bindEnvironment

if (Meteor.isServer) {
  var Path = Meteor.npmRequire('path')
  var Watchr = Meteor.npmRequire("watchr")
    
  Meteor.publish("slideshow", function () {
    return Slideshow.find({}, {sort: {i: 1}})
  })
    
  // The slideshow
  // Remove all selected images at startup and pick 3
  Meteor.startup(function () {
    
    var get = function (count, from) {
      var got = Images.find({order: {$gt: from}}, {sort: {order: 1}, limit: count}).fetch()
      if (from < 0 && got.length === 0) {
        return []
      }
      if (got.length < count && from != 0) {
        get(count - got.length, -1).forEach(function (item) {
          got.push(item)
        })
      }
      return got
    }
    
    //put 3 images into the slideshow
    var reset = function (from) {
      Slideshow.remove({})
      get(3, from).forEach(function (image, i) {
        Slideshow.insert({
          path: image.path,
          order: image.order,
          i: i
        })
      })
    }

    var update = function () {
      var current = Slideshow.findOne({}, {sort: {i: 1}});
      if (current != undefined)
        reset(current.order)
      else
        reset(-1)
    }
    
    var prt = function () {
      Meteor.defer(function () {
        console.log(Slideshow.find({}, {sort: {i: 1}}).fetch())
      })
    }
    
    reset()
    setInterval(BIND(function () {
      update()
      prt()
    }), 5000)
  })

      
    
  Meteor.startup(function () {
    console.log("Images path is ", FileSlide.path())
    // Enumerate existing
    var loadExisting = function (path, done) {
      var fs = Meteor.npmRequire("fs")
      fs.readdir(path, BIND(function (err, files) {
        dbImages = FileSlide.images().map(function (image) {
          return image.path
        })
        console.log("disk:", files)
        console.log("  db:", dbImages)
        done(files, dbImages)
      }))

    }
    // code to run on server at startup
    loadExisting(FileSlide.path(), function (diskFiles, dbFiles) {
      FileSlide.merge(diskFiles, dbFiles)
    })
    Watchr.watch({
      paths: [FileSlide.path()],
      listeners: {
        log: function (msg) {
        },
        watching: function (err) {
        },
        error: function (err) {
          console.log("Error", err);
        },
        change: BIND(function (type, filePath, newStat, oldStat) {
            if (type === 'create') {
              console.log("Addimg image ", filePath)
              FileSlide.add(filePath)
            }
            if (type === 'delete') {
              console.log("removing image ", filePath)
              FileSlide.remove(filePath)
            }
        })
      },
      next: function(err,watchers) {
        if (err) {
            return console.log("watching everything failed with error", err);
        }
      }
    })
  });
}