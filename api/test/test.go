package main
import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/jinzhu/gorm"
	_ "github.com/jinzhu/gorm/dialects/sqlite"
)

var db *gorm.DB
var err error

type Notification struct {
	ID	uint	`json:"id"`
	Message	string	`json:"message"`
	Tags	string	`json:"tags"`
	NotifyTime	uint	`json:"notify_time"`
	Status	uint	`json:"status"`
}

func main() {
	db, _ = gorm.Open("sqlite3", "./gorm.db")
	defer db.Close()

	db.AutoMigrate(&Notification{})

	r := gin.Default()

	r.GET("/notification/", ListNotifications)
	r.GET("/notification/:id", GetNotification)
	r.POST("/notification/", CreateNotification)
	r.PUT("/notification/:id", UpdateNotification)
	r.DELETE("/notification/:id", DeleteNotification)

	r.Run(":8080")
}

func ListNotifications(c *gin.Context) {
	var notifications []Notification
	if err := db.Find(&notifications).Error; err != nil {
		c.AbortWithStatus(404)
		fmt.Println(err)
	} else {
		c.JSON(200, notifications)
	}
}

func GetNotification(c *gin.Context) {
	var notification Notification
	id := c.Params.ByName("id")
	if err = db.Where("id = ?", id).First(&notification).Error; err != nil {
		c.AbortWithStatus(404)
		fmt.Println(err)
	} else {
		c.JSON(200, notification)
	}
}

func CreateNotification(c *gin.Context) {
	var notification Notification
	c.BindJSON(&notification)

	db.Create(&notification)
	c.JSON(200, notification)
}

func UpdateNotification(c *gin.Context) {
	var notification Notification
	id := c.Params.ByName("id")
	if err = db.Where("id = ?", id).First(&notification).Error; err != nil {
		c.AbortWithStatus(404)
		fmt.Println(err)
	} else {
		c.BindJSON(&notification)
		db.Save(&notification)
		c.JSON(200, notification)
	}
}

func DeleteNotification(c *gin.Context) {
	var notification Notification
	id := c.Params.ByName("id")
	if err = db.Where("id = ?", id).First(&notification).Error; err != nil {
		c.AbortWithStatus(404)
		fmt.Println(err)
	} else {
		db.Delete(&notification)
		c.JSON(200, gin.H{"notification #" + id: "deleted"})
	}
}

