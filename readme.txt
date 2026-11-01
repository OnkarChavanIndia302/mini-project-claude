# 1. go to project folder 
cd E:\CloudBox-project

# 2. go to backend
cd E:\CloudBox-project\backend

# 3. Backend packages install (if needed)
npm install

# 4. AWS login
aws login --region us-east-1

# 5. AWS login verify 
aws sts get-caller-identity --region us-east-1

# 6. S3 bucket check 
aws s3api head-bucket --bucket omkarchavan321122 --region us-east-1

# 7. from s3 encrypted files list 
aws s3 ls s3://omkarchavan321122/encrypted/ --region us-east-1

# 8. Backend start 
node server.js

# 9. Backend check 
Invoke-RestMethod http://localhost:3000/






https://902061579247-k42hmyyu.us-east-1.console.aws.amazon.com/s3/buckets/omkarchavan321122?region=us-east-1&prefix=encrypted/&showversions=false


https://master.d1ko6k4o5fgnw4.amplifyapp.com



[https://mini-project-claude.onrender.com]
(https://mini-project-claude.onrender.com)



https://master.d1ko6k4o5fgnw4.amplifyapp.com/