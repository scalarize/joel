package main
import (
	"fmt"

	"github.com/jinzhu/gorm"
	_ "github.com/jinzhu/gorm/dialects/sqlite"
)

type Notification struct {
	ID	uint	`json:"id"`
	Message	string	`json:"message"`
	Tags	string	`json:"tags"`
	NotifyTime	uint	`json:"notify_time"`
	Status	uint	`json:"status"`
}

func main() {
	db, _ := gorm.Open("sqlite3", "./gorm.db")
	defer db.Close()

	db.AutoMigrate(&Notification{})

	n1 := Notification{ Message: "common 12", NotifyTime: 10 }
	n2 := Notification{ Message: "holy 12", NotifyTime: 12 }

	db.Create(&n1)

	var n3 Notification
	db.First(&n3)

	fmt.Println(n1.Message)
	fmt.Println(n2.Message)
	fmt.Println(n3.Message)
}

