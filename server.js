const PORT = 8080;
const path = require("path");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cookieSession = require('cookie-session');
const nodeSassMiddleware = require("node-sass-middleware");
const bcrypt = require("bcrypt")

const pg = require("pg");
// const settings = require('./db/settings')
// const knex = require('knex')({
//   client: 'pg',
//   connection: {
//     host : settings.hostname,
//     user : settings.user,
//     password : settings.password,
//     database : settings.database
//   }
// });
const queries = require("./db/queries/queries.js");

const mockDB = {
  users:{},
  restaurants:{
    1:{
      name: "Great Restaurant",
      address: "10 Drury Lane",
      phone_number: "444-444-4444",
    }
  },
  items:[
    {
      id:99,
      name:"Hamburger",
      description:"Ethical you probably haven't heard of them flannel chia health goth lumbersexual twee fingerstache keffiyeh polaroid.",
      price:"10.99",
      imageURL:"/images/burger-2.jpg",
      prep_time:10
    },
  ],
  cart:[]
};

app.use(cookieSession({
  name: "session",
  resave: true,
  keys: ["supersecret"],
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

const tokens = require('./twilio_token')
const accountSid = 'ACe8fda14d2cd2d5b6997bd8a1e08bf9c5';
const authToken = tokens.TWILIO_TOKEN
const twilioClient = require('twilio')(accountSid, authToken);//send a message
const client = require('twilio')(accountSid, authToken);//send a message

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({extended: true}));
app.use(nodeSassMiddleware({
    src: path.join(__dirname, "./styles"),
    dest: path.join(__dirname, "./public"),
    debug: true,
    outputStyle: "compressed",
}));
app.use(express.static(path.join(__dirname, "./public")));

/*-----Twilio--------*/
app.post('/sms', (req, res) => {
  twilioClient.messages
  .create({
     body: `Hello ${knex.select('first_name').from('customer')}! The order for ${knex.select('orderLine_id').from('orderLine')} has been received at ${knex.select('order_date').from('order')}. Your total is ${knex.select('total_price').from('orderLine')} and your food will arrive in ${knex.select('total_prep_time').from('orderLine')}.`,
     from: '+13069940672',
     to: '+16475376750'
   })
  .then(message => console.log(message.sid))
  .done();
  res.redirect('/')
});

//remove underscores and cap first letter
let prettyFormatFormField = (field_val) => {
  let wordArr = field_val.split("_");
  let outStr = wordArr.reduce((acc, cur) => {
    acc = acc + cur[0].toUpperCase() + cur.slice(1) + " ";
    return acc;
  }, "")
  return outStr.trim();
}

app.get("/", (req, res) => {
  let login_field_errs;
  if(req.session.login_field_errs){
    login_field_errs = req.session.login_field_errs;
    req.session.login_field_errs = null;
  }

  let templateVars = {
    email:req.session.email,
    first_name:req.session.first_name,
    login_field_errs:login_field_errs
  };
  res.render("index", templateVars);
});

app.get("/404", (req, res) => {
  let templateVars = {
    email:req.session.email,
    first_name:req.session.first_name,
  };
  res.render("404", templateVars);
});

app.get("/menus/:menu_id", (req, res) => {
  let outData = mockDB.items[0];
  // console.log("menu_id: ", menu_id);
  console.log("function is    :", queries.selectItemsFromMenu);
  queries.selectItemsFromMenu(2).then(result => {
    console.log("result: ", result);
  })
  res.json(outData);
})

//get the restaurant page and display menus
//once in this route, it should behave like a single page application - lots of ajax
app.get("/restaurants/:id", (req, res) => {
  let restaurantId = req.params.id;

  queries.selectMenusFromRestaurants(restaurantId).then(menus => {
    //if search finds any menus
    if(menus.length > 0){
      let menusObj = menus.reduce((acc, cur) => {
        let key = cur.name.toLowerCase() + "_menu_id";
        acc[key] = cur.menu_id;
        return acc;
      }, {})

      res.render("restaurant", {
        menusObj: menusObj,
        email: req.session.email,
        first_name: req.session.first_name,
      });

    //else no menus -- 404
    }else{
      res.status(404).redirect("/404");
    }
  })
})

//delete item from logged-in user cart
app.post("/cart/items/:id/delete", (req, res) => {
  console.log("deleting item from cart")
});

//add item to logged-in user cart
app.post("/cart/items/:id", (req, res) => {
  let item_id_exists = true // once db hooked up, check that item exists in db
  let id = req.params.id;
  let quantity = req.body.quantity;

  if(item_id_exists){
    mockDB.cart.push({
      id:req.params.id,
      quantity:req.body.quantity,
      cost:5*req.body.quantity,
    });
    res.json({inData:req.body})
  }else{
    res.json({status:"failed"})
  }
});


//view all items in cart before checkout
app.get("/cart", (req, res) => {

  //if user is logged in
  if(req.session.email){
    let items = mockDB.cart;
    let total = items.reduce((acc, cur) => {
      acc += cur.quantity * cur.cost;
      return acc
    },0);
    res.json({
      items: items,
      total: total,
    });

  //else forbidden, user is not logged in
  }else{
    res.status(403);
  }
})

//confirm checkout -- twilio db stuff and twilio text goes in here
app.post("/cart", (req, res) => {

})

app.get("/login", (req, res) => {
  //login_field_errs represent missing fields - login validation errors represent some kind of authentication failure
  let login_field_errs;
  let login_validation_err;
  if(req.session.login_field_errs){
    login_field_errs = req.session.login_field_errs;
    req.session.login_field_errs = null;
  }
  if(req.session.login_validation_err){
    login_validation_err = req.session.login_validation_err;
    req.session.login_validation_err = null;
  }

  let templateVars = {
    email: req.session.email,
    first_name: req.session.first_name,
    login_field_errs: login_field_errs,
    login_validation_err: login_validation_err
  }
  res.render("login", templateVars)
})

app.post("/login", (req,res) => {
  let email = req.body.email;
  let password = req.body.password;

  //check that post request contains an email and password
  let login_field_errs = [];
  if(! email) login_field_errs.push("Email");
  if(! password) login_field_errs.push("Password");

  //login contains missing fields
  if(login_field_errs.length > 0){
    req.session.login_field_errs = login_field_errs;
    res.redirect("/login");
  }else{
    //if username doesn't exist in db -- need function here
    if(false){
      req.session.login_validation_err = "Login Does Not Exist";
      res.redirect("/login");

    //usename exists so now check if passwords match
    }else{

      queries.getPass(req.body.email).then(result => {
        let dbHash = result[0].password;

        //if password matches hash
        if(bcrypt.compareSync(req.body.password, dbHash)){
          req.session.email = email;
          res.redirect("/");

        //incorrect password
        }else{
          req.session.login_validation_err = "Incorrect Email Or Password";
          res.redirect("/login");
        }
      });
    }
  }
})

app.get("/signup", (req, res) => {
  //check if previous signup attempt set any session cookie errors ie failed validation
  //save error as template var and destroy cookie
  let signup_field_errs;
  if(req.session.signup_field_errs){
    signup_field_errs = req.session.signup_field_errs;
    req.session.signup_field_errs = null;
  }
  let templateVars = {
    email:req.session.email,
    first_name:req.session.first_name,
    signup_field_errs:signup_field_errs,
  }
  res.render("signup", templateVars);
});

app.post("/signup", (req, res) => {
  let fields = ["email", "password", "first_name", "last_name", "phone_number"]
  let signup_field_errs = [];

  for(field of fields){
    if(! req.body[field]){
      let formattedField = prettyFormatFormField(field);
      signup_field_errs.push(formattedField);
    }
  }
  req.session.signup_field_errs = signup_field_errs;
  //one or more fields failed so we need to redirect back to signup
  if(signup_field_errs.length > 0){
    res.redirect("/signup");

  //success - push the new user into the database and redirect to home page
  }else{
    queries.insertIntoCustomers({
      email: req.body.email,
      password: bcrypt.hashSync(req.body.password, 10),
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      phone_number: req.body.phone_number,
    });

    req.session.email = req.body.email;
    req.session.first_name = req.body.first_name;
    res.redirect("/");
  }
});

app.post("/logout", (req, res) => {
  req.session.email = null;
  req.session.first_name = null;
  res.redirect("/");
})

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

